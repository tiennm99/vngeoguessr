import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { cityNames, cityBboxes, cityDeltas } from '../../../lib/game.js';
import { fetchMapillaryImages } from '../../../lib/mapillary.js';
import { storeGameSession, getGameSession } from '../../../lib/session.js';

// Generate a unique session ID using uuid
function generateSessionId() {
  return uuidv4();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const cityCode = searchParams.get('city');
  const sessionId = searchParams.get('sessionId');

  if (!cityCode) {
    return NextResponse.json({ success: false, error: 'Missing city parameter' });
  }


  const cityName = cityNames[cityCode];
  if (!cityName) {
    return NextResponse.json({
      success: false,
      error: `Unsupported city code: ${cityCode}`
    }, { status: 400 });
  }

  try {
    console.log('Getting images for city:', cityName);

    // Get city bbox + per-city Mapillary delta (half-side of query window)
    const bbox = cityBboxes[cityCode];
    const delta = cityDeltas[cityCode];
    if (!bbox) {
      return NextResponse.json({
        success: false,
        error: `No bbox found for city: ${cityCode}`
      }, { status: 400 });
    }
    if (!delta) {
      return NextResponse.json({
        success: false,
        error: `No Mapillary delta configured for city: ${cityCode}`
      }, { status: 400 });
    }

    // Fetch images from city bbox via random-point dart-throw
    const imageResult = await fetchMapillaryImages(bbox, delta);

    if (!imageResult.success) {
      // The user-facing message is generic; keep the real cause in the logs so
      // an API outage is not silently reported as missing city coverage.
      console.error(`Mapillary search failed for ${cityName}: ${imageResult.error}`);
      return NextResponse.json({
        success: false,
        error: `No street view images found in ${cityName}. This city may not have sufficient Mapillary coverage.`
      });
    }

    // Select a random panoramic image
    const panoImages = imageResult.data.filter(img => img.is_pano);
    const selectedImage = panoImages.length > 0 ?
      panoImages[Math.floor(Math.random() * panoImages.length)] :
      imageResult.data[0];

    const exactLocation = {
      lat: selectedImage.geometry.coordinates[1],
      lng: selectedImage.geometry.coordinates[0]
    };

    // Prefer the 2048px panorama: the original is often 4-8 MP and several
    // megabytes, which dominates round latency on mobile data and strains
    // WebGL texture memory on phones. Fall back when Mapillary has no 2048
    // derivative for the image.
    const imageUrl = selectedImage.thumb_2048_url || selectedImage.thumb_original_url;

    // Create or update game session
    const currentSessionId = sessionId || generateSessionId();
    await storeGameSession(currentSessionId, {
      sessionId: currentSessionId,
      cityCode,
      exactLocation,
      imageId: selectedImage.id,
      createdAt: Date.now()
    });

    console.log(`Session ${currentSessionId} created with exact location:`, exactLocation);
    console.log(`Using image URL:`, imageUrl);

    return NextResponse.json({
      success: true,
      sessionId: currentSessionId,
      imageData: {
        id: selectedImage.id,
        url: imageUrl,
        isPano: selectedImage.is_pano || false
      }
    });

  } catch (error) {
    console.error('Location/Mapillary API Error:', error);

    // Provide specific error messages based on error type
    let errorMessage = 'Failed to fetch street view images. Please try again.';

    if (error.message.includes('City not found')) {
      errorMessage = `City "${cityName}" not found in mapping database.`;
    } else if (error.message.includes('No polygon data')) {
      errorMessage = `No boundary data available for "${cityName}".`;
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
        cityCode: session.cityCode,
        createdAt: session.createdAt
        // Don't expose exact location for security
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
