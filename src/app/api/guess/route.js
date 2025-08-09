import { NextResponse } from 'next/server';
import { submitScore } from '../../../lib/leaderboard.js';
import { calculateDistance, calculateScore } from '../../../lib/game.js';
import { gameSessions } from '../new-game/route.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, guessLat, guessLng, sessionId, timeLeft } = body;
    
    // Validate required fields
    if (!username || !sessionId ||
        guessLat === undefined || guessLng === undefined) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: username, sessionId, guess coordinates' 
      }, { status: 400 });
    }
    
    // Get session data
    const session = gameSessions.get(sessionId);
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
    const numTimeLeft = Number(timeLeft) || 0;
    
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
    
    // Validate time left (should be between 0-180 seconds for 3-minute game)
    if (numTimeLeft < 0 || numTimeLeft > 180) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid time remaining' 
      }, { status: 400 });
    }
    
    // Vietnam bounding box check for target coordinates (anti-cheat)
    const vietnamBounds = {
      minLat: 8.0, maxLat: 24.0,
      minLng: 102.0, maxLng: 110.0
    };
    
    if (numTargetLat < vietnamBounds.minLat || numTargetLat > vietnamBounds.maxLat ||
        numTargetLng < vietnamBounds.minLng || numTargetLng > vietnamBounds.maxLng) {
      return NextResponse.json({ 
        success: false, 
        error: 'Target coordinates outside Vietnam region' 
      }, { status: 400 });
    }
    
    // Calculate distance between guess and target (server-side)
    const distance = calculateDistance(
      numGuessLat, numGuessLng,
      numTargetLat, numTargetLng
    );
    
    // Calculate score based on distance (server-side)
    const score = calculateScore(distance);
    
    // Apply time bonus (optional - you can remove this)
    let finalScore = score;
    if (numTimeLeft > 120) { // More than 2 minutes left
      finalScore = Math.min(5, score + 0.1); // Tiny bonus for speed
    }
    finalScore = Math.round(finalScore * 10) / 10; // Round to 1 decimal
    
    // Submit to leaderboard with calculated score
    const leaderboardResult = await submitScore(username.trim(), finalScore);
    
    // Log the submission for anti-cheat monitoring
    console.log('Game submission:', {
      username: username.trim(),
      distance: `${distance}m`,
      score: finalScore,
      timeLeft: numTimeLeft,
      coordinates: {
        guess: [numGuessLat, numGuessLng],
        target: [numTargetLat, numTargetLng]
      },
      timestamp: new Date().toISOString()
    });
    
    // Clean up session after successful submission
    gameSessions.delete(sessionId);
    
    return NextResponse.json({
      success: true,
      gameResult: {
        distance,
        score: finalScore,
        rank: leaderboardResult.entry?.rank || null,
        exactLocation: {
          lat: numTargetLat,
          lng: numTargetLng
        }
      },
      leaderboard: leaderboardResult,
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

export async function GET(request) {
  return NextResponse.json({ 
    success: false, 
    error: 'GET method not supported for game submissions' 
  }, { status: 405 });
}