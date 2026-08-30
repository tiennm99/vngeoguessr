import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getRegion } from '../../../lib/regions.js';
import { resolvePlayableRegion, publicRegion } from '../../../lib/region-request.js';
import { fetchRegionPanorama } from '../../../lib/mapillary.js';
import { storeGameSession, getGameSession } from '../../../lib/session.js';

// Generate a unique session ID using uuid
function generateSessionId() {
  return uuidv4();
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

  try {
    // The location comes from the prebuilt index, so this is one lookup rather
    // than a search over an area.
    const imageResult = await fetchRegionPanorama(pickedRegion);

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

    console.log(`Session ${currentSessionId} created in ${selectedImage.regionCode}`);

    return NextResponse.json({
      success: true,
      sessionId: currentSessionId,
      // Built from the picked region only -- never from the resolved district.
      region: publicRegion(pickedRegion),
      imageData: {
        id: selectedImage.id,
        url: imageUrl,
        isPano: selectedImage.isPano
      }
    });

  } catch (error) {
    console.error('Location/Mapillary API Error:', error);

    let errorMessage = 'Failed to fetch street view images. Please try again.';

    if (error.message.includes('without a resolved region')) {
      errorMessage = 'Panorama index is missing its district assignments. ' +
        'Run scripts/assign-pano-districts.mjs.';
    } else if (error.message.includes('No panorama index')) {
      errorMessage = `No panorama data available for "${pickedName}".`;
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
        pickedRegion: session.pickedRegion ?? session.cityCode ?? null,
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
