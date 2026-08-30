import { NextResponse } from 'next/server';
import { getLeaderboard } from '../../../lib/leaderboard.js';
import { getRegion, COUNTRY_CODE } from '../../../lib/regions.js';
import { resolveRegion } from '../../../lib/region-request.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Any level: country, province or district. Absent means the country, and
    // ?city= still works for links made before the tree.
    const resolved = resolveRegion(searchParams, false);
    if (!resolved.ok) {
      // Rejected rather than served as an empty board: an unknown code used to
      // come back indistinguishable from a region nobody has played yet, which
      // hides typos.
      return NextResponse.json(
        { success: false, error: resolved.error },
        { status: resolved.status }
      );
    }

    const regionCode = resolved.code;
    const limit = parseInt(searchParams.get('limit')) || 100;
    const type = searchParams.get('type') || 'score'; // 'score' or 'distance'

    const leaderboard = await getLeaderboard(regionCode, limit, type);

    return NextResponse.json({
      success: true,
      leaderboard,
      count: leaderboard.length,
      region: { code: regionCode, name: getRegion(regionCode).name },
      leaderboardType: type,
      // Pre-tree field names, kept so existing callers keep working.
      type: regionCode === COUNTRY_CODE ? 'global' : 'city',
      cityCode: regionCode === COUNTRY_CODE ? null : regionCode,
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
