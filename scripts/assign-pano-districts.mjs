// Re-clip each province's panorama index against its current boundary, and
// rewrite the header to match.
//
//   node scripts/assign-pano-districts.mjs           # every province
//   node scripts/assign-pano-districts.mjs HN TPHCM  # only these
//
// Network-free by design. The panoramas are already on disk; re-fetching them
// per district would multiply a ~2,800-tile build against Mapillary's
// 50,000/day cap for data we already hold.
//
// Why re-clipping is needed at all: the boundaries are now built per district
// and unioned upward, at a tighter simplification tolerance than the old
// whole-city outlines. A province's edge therefore moves by a few metres, and
// panoramas clipped against the old outline no longer agree with the new one.
// Leaving them would break the containment guarantee the index rests on --
// every entry is meant to be inside the region it is served for.
//
// District assignment (a `d` field per panorama, and the per-leaf counts the UI
// needs) lands in this same script in the next phase.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import * as turf from '@turf/turf';

const BOUNDARY_DIR = 'src/data/boundaries';
const PANO_DIR = 'src/data/panos';

/** A province's boundary feature. */
function loadBoundary(code) {
  const slug = code.toLowerCase();
  return JSON.parse(readFileSync(`${BOUNDARY_DIR}/${slug}/${slug}.json`, 'utf8'));
}

/**
 * Rewrite one province's index against its current boundary.
 * @param {string} code Province code.
 * @returns {{kept: number, dropped: number}} Outcome.
 */
function reclip(code) {
  const path = `${PANO_DIR}/${code.toLowerCase()}.json`;
  const index = JSON.parse(readFileSync(path, 'utf8'));
  const boundary = loadBoundary(code);
  const [west, south, east, north] = boundary.properties.bbox;

  const kept = index.panos.filter((p) => {
    // Cheap rejection first: point-in-polygon against a detailed outline is the
    // expensive part, and most strays fall outside the box.
    if (p.lat < south || p.lat > north || p.lng < west || p.lng > east) return false;
    return turf.booleanPointInPolygon(turf.point([p.lng, p.lat]), boundary);
  });

  const dropped = index.panos.length - kept.length;

  const header = {
    code,
    name: boundary.properties.name,
    center: boundary.properties.center,
    bbox: boundary.properties.bbox,
    count: kept.length,
    source: index.source,
    grid: index.grid,
    generatedAt: index.generatedAt,
    reclippedAt: new Date().toISOString(),
  };

  // Written by hand rather than through JSON.stringify's indent option: one
  // panorama per line keeps a six-figure list diffable and editable, where a
  // fully indented file would run to millions of lines.
  const body =
    Object.entries(header)
      .map(([key, value]) => ` ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
      .join('\n') +
    '\n "panos": [\n' +
    kept.map((p) => `  {"id":${JSON.stringify(p.id)},"lat":${p.lat},"lng":${p.lng}}`).join(',\n') +
    '\n ]\n';

  writeFileSync(path, `{\n${body}}\n`);
  return { kept: kept.length, dropped };
}

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const available = readdirSync(PANO_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, '').toUpperCase());
const codes = requested.length ? requested : available;

let totalDropped = 0;
for (const code of codes) {
  const { kept, dropped } = reclip(code);
  totalDropped += dropped;
  const mb = (statSync(`${PANO_DIR}/${code.toLowerCase()}.json`).size / 1e6).toFixed(1);
  console.log(
    `${code.padEnd(6)} ${String(kept).padStart(7)} kept` +
      (dropped ? `, ${dropped} dropped outside the new outline` : '') +
      `  (${mb} MB)`
  );
}
console.log(totalDropped ? `\n${totalDropped} panoramas dropped in total` : '\nno panoramas dropped');
