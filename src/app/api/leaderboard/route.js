import { NextResponse } from 'next/server';
import { getLeaderboard } from '../../../lib/leaderboard.js';

export async function GET(request) {
  try {
    // Get top 100 leaderboard entries
    const leaderboard = await getLeaderboard(100);

    return NextResponse.json({
      success: true,
      leaderboard,
      count: leaderboard.length
    });

  } catch (error) {
    console.error('Leaderboard GET Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch leaderboard',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
