import { NextResponse } from 'next/server';
import { submitRoundScore, submitDistanceRecord } from '../../../lib/leaderboard.js';
import { getGameSession, deleteGameSession } from '../../../lib/session.js';
import { calculateDistance, calculateScore } from '../../../lib/game.js';
import { publicRegion } from '../../../lib/region-request.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, guessLat, guessLng, sessionId } = body;

    // Validate required fields
    if (!username || !sessionId ||
        guessLat === undefined || guessLng === undefined) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: username, sessionId, guess coordinates'
      }, { status: 400 });
    }

    // Get session data from Redis
    const session = await getGameSession(sessionId);
    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'Session not found or expired'
      }, { status: 400 });
    }

    // Get target coordinates from session
    const targetLat = session.exactLocation.lat;
    const targetLng = session.exactLocation.lng;

    // Validate coordinate ranges
    const numGuessLat = Number(guessLat);
    const numGuessLng = Number(guessLng);
    const numTargetLat = Number(targetLat);
    const numTargetLng = Number(targetLng);

    // Basic coordinate validation
    if (Math.abs(numGuessLat) > 90 || Math.abs(numTargetLat) > 90) {
      return NextResponse.json({
        success: false,
        error: 'Invalid latitude values'
      }, { status: 400 });
    }

    if (Math.abs(numGuessLng) > 180 || Math.abs(numTargetLng) > 180) {
      return NextResponse.json({
        success: false,
        error: 'Invalid longitude values'
      }, { status: 400 });
    }


    // Calculate distance between guess and target (server-side)
    const distance = calculateDistance(
      numGuessLat, numGuessLng,
      numTargetLat, numTargetLng
    );

    // One ladder for every region: the same distance is worth the same points
    // whether the player picked a district or the whole country.
    const finalScore = calculateScore(distance);

    // The region the panorama was actually in, resolved server-side when the
    // round was created. Never read from the request: a client that could name
    // its own region could farm any district's board.
    const scoringRegion = session.regionCode;

    // Claim the session before writing, and score only if this request is the
    // one that removed it. DEL is atomic, so exactly one of N concurrent
    // submits wins; reading the session and deleting it without checking the
    // result lets every one of them through, because they all read it alive.
    //
    // Consuming first also closes the sequential case: a failure partway
    // through the fan-out would otherwise leave the session alive for up to 30
    // minutes and a retry would re-credit every level that already succeeded.
    const consumed = await deleteGameSession(sessionId);
    if (!consumed) {
      return NextResponse.json({
        success: false,
        error: 'Session already submitted or expired'
      }, { status: 400 });
    }

    // Boards are credited per level from the raw distance against the same
    // ladder, so every level records the identical points for this round.
    const leaderboardResult = await submitRoundScore(username.trim(), distance, scoringRegion);
    const distanceResult = await submitDistanceRecord(username.trim(), distance, scoringRegion);

    // Log the submission for anti-cheat monitoring
    console.log('Game submission:', {
      username: username.trim(),
      distance: `${distance}m`,
      score: finalScore,
      coordinates: {
        guess: [numGuessLat, numGuessLng],
        target: [numTargetLat, numTargetLng]
      },
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      gameResult: {
        distance,
        score: finalScore,
        // One entry per level credited, outermost last. The client renders
        // these directly rather than a fixed global/city pair.
        levels: leaderboardResult.levels,
        distanceLevels: distanceResult.levels,
        // Where the panorama actually was. Safe now, and only now: the guess
        // is in.
        region: publicRegion(scoringRegion),
        globalRank: leaderboardResult.global?.rank ?? null,
        cityRank: leaderboardResult.province?.rank ?? null,
        globalDistanceRank: distanceResult.globalDistance?.rank ?? null,
        cityDistanceRank: distanceResult.provinceDistance?.rank ?? null,
        exactLocation: {
          lat: numTargetLat,
          lng: numTargetLng
        }
      },
      leaderboard: leaderboardResult,
      distance: distanceResult,
      message: 'Game result processed successfully'
    });

  } catch (error) {
    console.error('Submit Guess Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process game result',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: false,
    error: 'GET method not supported for game submissions'
  }, { status: 405 });
}
