import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getRandomCityLocation, cityNominatimNames } from '../../../lib/game.js';
import { fetchMapillaryImages } from '../../../lib/mapillary.js';

// In-memory game session storage (in production, use Redis or database)
const gameSessions = new Map();
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes

// Generate a unique session ID using uuid
function generateSessionId() {
  return uuidv4();
}

// Clean up expired sessions
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of gameSessions.entries()) {
    if (now - session.createdAt > SESSION_EXPIRY) {
      gameSessions.delete(sessionId);
    }
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const cityCode = searchParams.get('city');
  const sessionId = searchParams.get('sessionId');
  
  if (!cityCode) {
    return NextResponse.json({ success: false, error: 'Missing city parameter' });
  }

  // Get Mapillary access token from environment variables
  const MAPILLARY_ACCESS_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;
  
  if (!MAPILLARY_ACCESS_TOKEN) {
    console.error('MAPILLARY_ACCESS_TOKEN environment variable is not set');
    return NextResponse.json({ 
      success: false, 
      error: 'Mapillary service is not configured. Please check server configuration.'
    }, { status: 500 });
  }

  const cityName = cityNominatimNames[cityCode];
  if (!cityName) {
    return NextResponse.json({ 
      success: false, 
      error: `Unsupported city code: ${cityCode}` 
    }, { status: 400 });
  }
  
  try {
    // Clean up expired sessions
    cleanupExpiredSessions();
    
    console.log('Getting random location for city:', cityName);
    
    // Get accurate random location within city boundaries
    const { lat, lng } = await getRandomCityLocation(cityName);
    
    // Fetch images with retry logic
    const imageResult = await fetchMapillaryImages(lat, lng, MAPILLARY_ACCESS_TOKEN);
    
    if (!imageResult.success) {
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
    
    // Create or update game session
    const currentSessionId = sessionId || generateSessionId();
    gameSessions.set(currentSessionId, {
      sessionId: currentSessionId,
      cityCode,
      exactLocation,
      imageId: selectedImage.id,
      createdAt: Date.now()
    });
    
    console.log(`Session ${currentSessionId} created with exact location:`, exactLocation);
    
    return NextResponse.json({ 
      success: true, 
      sessionId: currentSessionId,
      imageData: {
        id: selectedImage.id,
        url: selectedImage.thumb_original_url,
        isPano: selectedImage.is_pano || false
      },
      searchInfo: {
        searchLocation: { lat, lng },
        radiusUsed: imageResult.radiusUsed,
        attempt: imageResult.attempt
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
  const body = await request.json();
  const { sessionId } = body;
  
  if (!sessionId) {
    return NextResponse.json({ success: false, error: 'Missing sessionId' });
  }
  
  const session = gameSessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Session not found' });
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
}

// Export session management functions for use in guess API
export { gameSessions };