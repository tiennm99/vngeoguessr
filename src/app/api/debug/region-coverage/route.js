import { NextResponse } from 'next/server';
import { REGION_BOUNDARIES } from '../../../../data/boundaries/index.js';
import { getRegionPanoSample, countPanos, getProvinceMeta } from '../../../../lib/pano-index.js';
import { getRegion, isRegion, provinceOf } from '../../../../lib/regions.js';

// Serves a region's outline and its panorama locations for the coverage debug
// page. Works at province or district level; the country has no polygon of its
// own. Points come back for the requested viewport only, sampled in SQL: Ha Noi
// holds 225,966 of them, which is 15.4MB of JSON and far more than a map can
// draw, so the whole index is never sent at once.
const DEFAULT_LIMIT = 12000;
const MAX_LIMIT = 40000;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // Any level with an outline. Empty-string params are why this is || and not
  // ??: URLSearchParams returns '' for ?region=, which ?? would keep.
  const code = (searchParams.get('region') || '').toUpperCase();

  // Any node with an outline: province or district. The country has no polygon
  // of its own, so there is nothing to draw for it.
  const boundary = REGION_BOUNDARIES[code];
  if (!isRegion(code) || !boundary) {
    return NextResponse.json(
      {
        success: false,
        error: `Unknown or unmapped region: ${code || '(none)'}`,
        available: Object.keys(REGION_BOUNDARIES),
      },
      { status: 400 }
    );
  }

  const region = getRegion(code);

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT)
  );

  // bbox is west,south,east,north, matching the order the rest of the app uses.
  const bboxParam = searchParams.get('bbox');
  let west = null;
  let south = null;
  let east = null;
  let north = null;
  if (bboxParam) {
    const parts = bboxParam.split(',').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      [west, south, east, north] = parts;
    }
  }

  const sample = await getRegionPanoSample(code, west, south, east, north, limit);
  const meta = await getProvinceMeta(provinceOf(code) ?? code);

  return NextResponse.json({
    success: true,
    region: {
      code,
      name: region.name,
      level: region.level,
      province: provinceOf(code),
    },
    // Only the first request for a region carries the outline. Returning it with
    // every viewport query gave the client a new object each time, which made
    // the map refit to the region and cancel whatever the user had zoomed into.
    boundary: bboxParam ? undefined : boundary,
    // When the province's panorama index was seeded. The page shows it so a
    // sparse-looking district can be told apart from a stale snapshot.
    generatedAt: meta?.generatedAt ?? null,
    counts: {
      total: await countPanos(code),
      inView: sample.inView,
      shown: sample.panos.length,
      // True when the viewport holds more points than were sent, so the page
      // can say the dots are a sample rather than the whole picture.
      sampled: sample.panos.length < sample.inView,
    },
    panos: sample.panos,
  });
}
