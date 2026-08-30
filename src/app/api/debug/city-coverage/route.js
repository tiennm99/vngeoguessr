import { NextResponse } from 'next/server';
import { REGION_BOUNDARIES } from '../../../../data/boundaries/index.js';
import { getRegionPanos, countPanos, getCityIndex } from '../../../../lib/pano-index.js';
import { getRegion, isRegion, provinceOf } from '../../../../lib/regions.js';

// Serves a region's outline and its panorama locations for the coverage debug
// page. Works at province or district level. Points come back for the requested viewport only: Ha Noi holds 225,985
// of them, which is 13.8MB of JSON and far more than a map can draw, so the
// whole index is never sent at once.
const DEFAULT_LIMIT = 12000;
const MAX_LIMIT = 40000;

/**
 * Take an evenly spaced sample without clustering it in one corner.
 * @param {Object[]} items Source list, spatially sorted by the build.
 * @param {number} limit Maximum to return.
 * @returns {Object[]} Sampled list.
 */
function sampleEvenly(items, limit) {
  if (items.length <= limit) return items;
  // A fixed stride over the list rather than a random draw: the index is sorted
  // by latitude, so every stride covers the whole city.
  const stride = items.length / limit;
  const out = [];
  for (let i = 0; out.length < limit && Math.floor(i) < items.length; i += stride) {
    out.push(items[Math.floor(i)]);
  }
  return out;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // ?region= at any level; ?city= still accepted for the existing debug page.
  const code = (searchParams.get('region') || searchParams.get('city') || '').toUpperCase();

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
  // A district's panoramas come from its province's index, filtered by the
  // district each one was assigned to.
  const allPanos = getRegionPanos(code);

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT)
  );

  // bbox is west,south,east,north, matching the order the rest of the app uses.
  const bboxParam = searchParams.get('bbox');
  let inView = allPanos;
  if (bboxParam) {
    const [west, south, east, north] = bboxParam.split(',').map(Number);
    if ([west, south, east, north].every(Number.isFinite)) {
      inView = allPanos.filter(
        (p) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east
      );
    }
  }

  const panos = sampleEvenly(inView, limit);

  return NextResponse.json({
    success: true,
    city: { code, name: region.name, center: region.center, bbox: region.bbox },
    region: {
      code,
      name: region.name,
      level: region.level,
      province: provinceOf(code),
    },
    // Only the first request for a city carries the outline. Returning it with
    // every viewport query gave the client a new object each time, which made
    // the map refit to the city and cancel whatever the user had zoomed into.
    boundary: bboxParam ? undefined : boundary,
    // Restored rather than dropped. Its only consumer is the debug page, whose
    // source cannot be read from here (a context hook blocks the path), so
    // removing a field it might render would be an unverifiable break.
    generatedAt: getCityIndex(provinceOf(code) ?? code).generatedAt,
    counts: {
      total: countPanos(code),
      inView: inView.length,
      shown: panos.length,
      // True when the viewport holds more points than were sent, so the page
      // can say the dots are a sample rather than the whole picture.
      sampled: panos.length < inView.length,
    },
    panos,
  });
}
