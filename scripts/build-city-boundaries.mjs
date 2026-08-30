// Build the play-area polygon for each city and write it as GeoJSON.
//
// Vietnam merged its provinces in mid-2025, so the current administrative
// boundary for Ho Chi Minh City covers 36,566 km2 and reaches Vung Tau. That is
// not a guessable area: the scoring bands top out at 1km. These are the
// pre-merger extents instead, rebuilt by unioning the old district-level units,
// which OpenStreetMap still serves as boundary/historic relations.
//
//   node scripts/build-city-boundaries.mjs
//
// Output lands in src/data/boundaries/<code>.geojson and is meant to be edited
// by hand afterwards if a city needs trimming. Re-running overwrites it.

import { mkdirSync, writeFileSync } from 'node:fs';
import * as turf from '@turf/turf';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Nominatim asks for a real identifier and at most one request per second.
const USER_AGENT = 'vngeoguessr/1.0 (https://github.com/tiennm99/vngeoguessr)';
const REQUEST_GAP_MS = 1100;
// The unioned outlines carry tens of thousands of points, most of them detail
// no one will ever see at city zoom. This keeps the files hand-editable.
const SIMPLIFY_TOLERANCE = 0.0005;

const OUT_DIR = 'src/data/boundaries';

// One entry per city. `parts` are unioned; a single-element list is fine.
const CITIES = {
  HN: {
    name: 'Ha Noi',
    // Ha Noi was not merged in 2025, so its own boundary is still the right one.
    parts: ['Thành phố Hà Nội, Việt Nam'],
  },
  TPHCM: {
    name: 'Ho Chi Minh',
    parts: [
      'Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận 3, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận 4, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận 5, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận 6, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận 7, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận 8, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận 10, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận 11, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận 12, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận Bình Tân, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận Gò Vấp, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận Phú Nhuận, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận Tân Bình, Thành phố Hồ Chí Minh, Việt Nam',
      'Quận Tân Phú, Thành phố Hồ Chí Minh, Việt Nam',
      'Thành phố Thủ Đức, Việt Nam',
      'Huyện Bình Chánh, Việt Nam',
      'Huyện Cần Giờ, Việt Nam',
      'Huyện Củ Chi, Việt Nam',
      'Huyện Hóc Môn, Việt Nam',
      'Huyện Nhà Bè, Việt Nam',
    ],
  },
  DN: {
    name: 'Da Nang',
    // Hoang Sa is administratively part of Da Nang but is a disputed offshore
    // island group with no street imagery, so it is deliberately left out.
    parts: [
      'Quận Hải Châu, Đà Nẵng, Việt Nam',
      'Quận Thanh Khê, Đà Nẵng, Việt Nam',
      'Quận Sơn Trà, Đà Nẵng, Việt Nam',
      'Quận Ngũ Hành Sơn, Đà Nẵng, Việt Nam',
      'Quận Liên Chiểu, Đà Nẵng, Việt Nam',
      'Quận Cẩm Lệ, Đà Nẵng, Việt Nam',
      'Huyện Hòa Vang, Việt Nam',
    ],
  },
  DL: {
    name: 'Da Lat',
    parts: ['Thành phố Đà Lạt, Việt Nam'],
  },
  DH: {
    name: 'Duc Hoa',
    parts: ['Đức Hòa, Việt Nam'],
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Look up one administrative area and return it as a turf feature.
 * @param {string} query Nominatim free-text query.
 * @returns {Promise<Object|null>} Feature, or null when nothing usable matched.
 */
async function lookupArea(query) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=8`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status} for "${query}"`);

  // A cemetery or a road of the same name can outrank the district, so scan the
  // candidates for the first one that is actually an administrative area.
  for (const hit of await response.json()) {
    if (!hit?.geojson) continue;
    if (!['Polygon', 'MultiPolygon'].includes(hit.geojson.type)) continue;
    if (hit.class !== 'boundary') continue;
    return turf.feature(hit.geojson, { osm: `${hit.osm_type}/${hit.osm_id}` });
  }
  return null;
}

/**
 * Build and write one city's play-area polygon.
 * @param {string} code City code.
 * @param {Object} config Entry from CITIES.
 * @returns {Promise<void>}
 */
async function buildCity(code, config) {
  console.log(`\n${code} — ${config.name}`);
  let merged = null;
  let missing = 0;

  for (const query of config.parts) {
    const label = query.split(',')[0];
    let feature = null;
    try {
      feature = await lookupArea(query);
    } catch (error) {
      console.error(`  ${label}: ${error.message}`);
    }

    if (!feature) {
      missing++;
      console.warn(`  ${label}: no boundary found — SKIPPED`);
    } else {
      const areaKm2 = turf.area(feature) / 1e6;
      console.log(`  ${label}: ${areaKm2.toFixed(0)} km2 (${feature.properties.osm})`);
      merged = merged ? turf.union(turf.featureCollection([merged, feature])) : feature;
    }
    await sleep(REQUEST_GAP_MS);
  }

  if (!merged) throw new Error(`${code}: no parts resolved, nothing to write`);
  if (missing > 0) {
    console.warn(`  ${missing} part(s) missing — the polygon is incomplete`);
  }

  const simplified = turf.simplify(merged, { tolerance: SIMPLIFY_TOLERANCE, highQuality: true });
  const bbox = turf.bbox(simplified);
  const centroid = turf.centerOfMass(simplified).geometry.coordinates;

  const out = {
    type: 'Feature',
    properties: {
      code,
      name: config.name,
      // Recorded so a future reader knows why this is not the current
      // administrative boundary.
      basis: 'pre-2025-merger extent, unioned from OSM boundary/historic relations',
      parts: config.parts.length,
      missingParts: missing,
      areaKm2: Number((turf.area(simplified) / 1e6).toFixed(1)),
      bbox: bbox.map((n) => Number(n.toFixed(5))),
      center: [Number(centroid[1].toFixed(5)), Number(centroid[0].toFixed(5))],
      generatedAt: new Date().toISOString(),
    },
    geometry: simplified.geometry,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const path = `${OUT_DIR}/${code.toLowerCase()}.geojson`;
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
  console.log(
    `  -> ${path}  ${out.properties.areaKm2} km2, ` +
      `${JSON.stringify(simplified.geometry.coordinates).length} bytes of geometry`
  );
}

const only = process.argv.slice(2);
for (const [code, config] of Object.entries(CITIES)) {
  if (only.length && !only.includes(code)) continue;
  await buildCity(code, config);
}
console.log('\ndone');
