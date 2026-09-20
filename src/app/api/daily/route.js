import { NextResponse } from 'next/server';
import { getDailyRound } from '../../../lib/daily.js';
import { dailyDay, dailyNumber } from '../../../lib/daily-calendar.js';
import { storeGameSession } from '../../../lib/session.js';
import { publicRegion } from '../../../lib/region-request.js';
import { COUNTRY_CODE } from '../../../lib/regions.js';
import {
  PLAYER_COOKIE,
  readPlayerId,
  newPlayerId,
  playerCookieOptions,
} from '../../../lib/player-id.js';

// Start today's daily challenge: one country-wide round whose panorama is the
// same for every player today. The round is an ordinary session, scored by
// /api/guess like any other, so it credits the boards once and counts in the
// statistics under its own level.
export async function GET(request) {
  const day = dailyDay();
  const playerId = readPlayerId(request) ?? newPlayerId();

  try {
    const round = await getDailyRound(day);

    const sessionId = crypto.randomUUID();
    await storeGameSession(sessionId, {
      sessionId,
      pickedRegion: COUNTRY_CODE,
      // SECRET until the guess, as on every round.
      regionCode: round.regionCode,
      exactLocation: { lat: round.lat, lng: round.lng },
      imageId: round.id,
      mode: 'daily',
      day,
      createdAt: Date.now(),
    });

    const response = NextResponse.json({
      success: true,
      sessionId,
      day,
      number: dailyNumber(day),
      region: publicRegion(COUNTRY_CODE),
      imageData: { url: round.url, isPano: round.isPano },
    });
    response.cookies.set(PLAYER_COOKIE, playerId, playerCookieOptions());
    return response;
  } catch (error) {
    console.error(`Daily challenge ${day} failed:`, error);
    return NextResponse.json({
      success: false,
      error: "Today's challenge could not be loaded. Please try again.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    }, { status: 500 });
  }
}
