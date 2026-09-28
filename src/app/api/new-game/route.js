import { NextResponse } from 'next/server';
import { getRegion } from '../../../lib/regions.js';
import { resolvePlayableRegion, publicRegion } from '../../../lib/region-request.js';
import { fetchRegionPanorama } from '../../../lib/mapillary.js';
import { storeGameSession } from '../../../lib/session.js';
import { isAuthFailure } from '../../../lib/errors.js';
import { getRecentPanoIds, recordPanoId } from '../../../lib/pano-history.js';
import {
  PLAYER_COOKIE,
  readPlayerId,
  newPlayerId,
  playerCookieOptions,
} from '../../../lib/player-id.js';

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
 * @param {string[]} recentIds The history read at the start of this request.
 * @returns {Promise<void>}
 */
async function recordPanoOrIgnore(playerId, panoId, recentIds) {
  try {
    await recordPanoId(playerId, panoId, recentIds);
  } catch (error) {
    console.error('Recent-location record failed:', error);
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

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
      console.error(`Round draw failed for ${pickedName} (${imageResult.kind}): ${imageResult.error}`);
      // Two different facts. A dry pool is about the region and gets the
      // coverage message; an outage is about the service and must not be
      // reported as missing coverage, or a Mapillary incident reads as the
      // map having shrunk.
      if (imageResult.kind === 'upstream') {
        return NextResponse.json({
          success: false,
          error: 'Street view is not answering right now. Please try again in a moment.',
        }, { status: 502 });
      }
      return NextResponse.json({
        success: false,
        error: `No street view images found in ${pickedName}. This region may not have sufficient Mapillary coverage.`
      }, { status: 404 });
    }

    const selectedImage = imageResult.data;
    const exactLocation = { lat: selectedImage.lat, lng: selectedImage.lng };

    // Always a fresh id, never one the client offers. Reusing an id let a new
    // round overwrite a session a guess had read but not yet claimed: the
    // guess scored the old answer and its claim deleted the new round.
    const currentSessionId = crypto.randomUUID();
    await storeGameSession(currentSessionId, {
      sessionId: currentSessionId,
      // What the player chose. Safe to echo back.
      pickedRegion,
      // SECRET, alongside exactLocation: this names the district the answer is
      // in (always set: the index resolves every row to one). Revealing it
      // before the guess turns a country-wide round into a 35 km2 one.
      regionCode: selectedImage.regionCode,
      exactLocation,
      imageId: selectedImage.id,
      createdAt: Date.now()
    });

    // Recorded at round creation, not at guess time, so a round the player
    // skips still counts as seen -- skipping is exactly how someone says they
    // do not want this location again.
    await recordPanoOrIgnore(playerId, selectedImage.id, recentIds);

    // Deliberately without the resolved district: that is the answer, and the
    // session store is the only place it should be written before the guess.
    console.log(`Session ${currentSessionId} created for ${pickedRegion}`);

    const response = NextResponse.json({
      success: true,
      sessionId: currentSessionId,
      // Built from the picked region only -- never from the resolved district.
      region: publicRegion(pickedRegion),
      // The pano id stays server-side in the session: with it a player could
      // look the panorama up on Mapillary and read the answer coordinates.
      imageData: {
        url: selectedImage.url,
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

    // `error` may not be an Error: a rejected promise can carry anything, and
    // a handler that reads `.message.includes` off it would itself throw.
    const detail = String(error?.message ?? error);
    const errorMessage = isAuthFailure(error)
      ? 'Mapillary authentication failed. Please check API token.'
      : 'Failed to fetch street view images. Please try again.';

    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? detail : undefined
    }, { status: 500 });
  }
}
