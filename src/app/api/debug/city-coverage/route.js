import { NextResponse } from 'next/server';
import { CITY_BOUNDARIES } from '../../../../data/boundaries/index.js';
import { PANO_INDEXES } from '../../../../data/panos/index.js';

// Serves a city's outline and its panorama locations for the coverage debug
// page. Points come back for the requested viewport only: Ha Noi holds 225,985
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
  const code = (searchParams.get('city') || '').toUpperCase();

  const boundary = CITY_BOUNDARIES[code];
  const index = PANO_INDEXES[code];
  if (!boundary || !index) {
    return NextResponse.json(
      {
        success: false,
        error: `Unknown city: ${code || '(none)'}`,
        available: Object.keys(PANO_INDEXES),
      },
      { status: 400 }
    );
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT)
  );

  // bbox is west,south,east,north, matching the order the rest of the app uses.
  const bboxParam = searchParams.get('bbox');
  let inView = index.panos;
  if (bboxParam) {
    const [west, south, east, north] = bboxParam.split(',').map(Number);
    if ([west, south, east, north].every(Number.isFinite)) {
      inView = index.panos.filter(
        (p) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east
      );
    }
  }

  const panos = sampleEvenly(inView, limit);

  return NextResponse.json({
    success: true,
    city: { code, name: index.name, center: index.center, bbox: index.bbox },
    // Only the first request for a city carries the outline. Returning it with
    // every viewport query gave the client a new object each time, which made
    // the map refit to the city and cancel whatever the user had zoomed into.
    boundary: bboxParam ? undefined : boundary,
    counts: {
      total: index.panos.length,
      inView: inView.length,
      shown: panos.length,
      // True when the viewport holds more points than were sent, so the page
      // can say the dots are a sample rather than the whole picture.
      sampled: panos.length < inView.length,
    },
    generatedAt: index.generatedAt,
    panos,
  });
}
