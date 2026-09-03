import { NextResponse } from 'next/server';
import { getRegion } from '../../../lib/regions.js';
import { resolvePlayableRegion, publicRegion } from '../../../lib/region-request.js';
import { fetchRegionPanorama } from '../../../lib/mapillary.js';
import { storeGameSession, getGameSession } from '../../../lib/session.js';
import { getRecentPanoIds, recordPanoId } from '../../../lib/pano-history.js';
import {
  PLAYER_COOKIE,
  readPlayerId,
  newPlayerId,
  playerCookieOptions,
} from '../../../lib/player-id.js';

// Generate a unique session ID
function generateSessionId() {
  return crypto.randomUUID();
}

// The recent-location history is a convenience, unlike the session write below
// it, which is load-bearing and must keep throwing. These two wrappers are what
// keep that difference visible: Redis trouble costs a player a repeated
// panorama, never their round. The library itself still reports failures, for
// any future caller that does care.

/**
 * A player's recently seen panoramas, or none if the store is unavailable.
 * @param {string} playerId Anonymous player id.
 * @returns {Promise<string[]>} Panorama ids.
 */
async function recentPanoIdsOrNone(playerId) {
  try {
    return await getRecentPanoIds(playerId);
  } catch (error) {
    console.error('Recent-location lookup failed:', error);
    return [];
  }
}

/**
 * Record a panorama as seen, tolerating a store that is unavailable.
 * @param {string} playerId Anonymous player id.
 * @param {string} panoId The panorama just shown.
 * @returns {Promise<void>}
 */
async function recordPanoOrIgnore(playerId, panoId) {
  try {
    await recordPanoId(playerId, panoId);
  } catch (error) {
    console.error('Recent-location record failed:', error);
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  // Accepts ?region= at any level, and ?city= for links made before the tree.
  const resolved = resolvePlayableRegion(searchParams);
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error }, { status: resolved.status });
  }
  const pickedRegion = resolved.code;
  const pickedName = getRegion(pickedRegion).name;

  // Anonymous, server-minted, and used for one thing: not showing this browser
  // a panorama it has just seen. Deliberately not the username -- that is
  // client-supplied, renameable, and shared by anyone who types it.
  const playerId = readPlayerId(request) ?? newPlayerId();

  try {
    // The location comes from the prebuilt index, so this is one lookup rather
    // than a search over an area. The player's last 50 panoramas are excluded
    // where the region can afford it; fetchRegionPanorama drops them rather
    // than let them empty a small pool.
    const recentIds = await recentPanoIdsOrNone(playerId);
    const imageResult = await fetchRegionPanorama(pickedRegion, new Set(recentIds));

    if (!imageResult.success) {
      // The user-facing message is generic; keep the real cause in the logs so
      // an API outage is not silently reported as missing coverage.
      console.error(`Mapillary search failed for ${pickedName}: ${imageResult.error}`);
      return NextResponse.json({
        success: false,
        error: `No street view images found in ${pickedName}. This region may not have sufficient Mapillary coverage.`
      });
    }

    const selectedImage = imageResult.data;

    // The district the panorama actually sits in, resolved server-side from the
    // panorama index. Scoring fans out from this, so an absent value is a bug
    // rather than something to paper over with the picked region -- that would
    // silently leave every district board empty forever.
    if (!selectedImage.regionCode) {
      throw new Error('Panorama came back without a resolved region');
    }

    const exactLocation = { lat: selectedImage.lat, lng: selectedImage.lng };
    const imageUrl = selectedImage.url;

    const currentSessionId = sessionId || generateSessionId();
    await storeGameSession(currentSessionId, {
      sessionId: currentSessionId,
      // What the player chose. Safe to echo back.
      pickedRegion,
      // SECRET, alongside exactLocation: this names the district the answer is
      // in. Revealing it before the guess turns a country-wide round into a
      // 35 km2 one.
      regionCode: selectedImage.regionCode,
      exactLocation,
      imageId: selectedImage.id,
      createdAt: Date.now()
    });

    // Recorded at round creation, not at guess time, so a round the player
    // skips still counts as seen -- skipping is exactly how someone says they
    // do not want this location again.
    await recordPanoOrIgnore(playerId, selectedImage.id);

    console.log(`Session ${currentSessionId} created in ${selectedImage.regionCode}`);

    const response = NextResponse.json({
      success: true,
      sessionId: currentSessionId,
      // Built from the picked region only -- never from the resolved district.
      region: publicRegion(pickedRegion),
      // The pano id stays server-side in the session: with it a player could
      // look the panorama up on Mapillary and read the answer coordinates.
      imageData: {
        url: imageUrl,
        isPano: selectedImage.isPano
      }
    });

    // Set on the success path only. An error response carries no id and the
    // next successful round mints one; spreading cookie handling across five
    // returns would buy nothing. Re-set every round so the max-age rolls
    // forward for a player who keeps playing.
    response.cookies.set(PLAYER_COOKIE, playerId, playerCookieOptions());
    return response;

  } catch (error) {
    console.error('Location/Mapillary API Error:', error);

    let errorMessage = 'Failed to fetch street view images. Please try again.';

    if (error.message.includes('without a resolved region')) {
      errorMessage = 'Panorama index is missing its district assignments. ' +
        'Run scripts/assign-pano-districts.mjs.';
    } else if (error.message.includes('Mapillary authentication failed')) {
      errorMessage = 'Mapillary authentication failed. Please check API token.';
    } else if (error.message.includes('fetch')) {
      errorMessage = 'Network error. Please check your connection.';
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

// Get session data (for debugging)
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId;

  if (!sessionId) {
    return NextResponse.json({ success: false, error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const session = await getGameSession(sessionId);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        // Only what the player picked. Neither exactLocation nor regionCode is
        // exposed: the caller owns this session id, so either one would hand
        // them the answer to their own round.
        pickedRegion: session.pickedRegion ?? null,
        createdAt: session.createdAt
      }
    });
  } catch (error) {
    console.error('Session lookup error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to look up session'
    }, { status: 500 });
  }
}
