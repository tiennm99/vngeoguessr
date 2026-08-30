// Assign every panorama already on disk to the district it sits in, and record
// what that leaves each region with.
//
//   node scripts/assign-pano-districts.mjs           # every province
//   node scripts/assign-pano-districts.mjs HN TPHCM  # only these
//
// Network-free by design. The panoramas are already here; re-fetching them per
// district would multiply a ~2,800-tile build against Mapillary's 50,000/day
// cap for bytes we already hold. Districts are a property of a panorama, not a
// separate dataset, so this rewrites the same five province files in place.
//
// Two passes per province:
//   1. Re-clip against the current province outline. The boundaries are built
//      per district and unioned upward at a tighter tolerance than the old
//      whole-city outlines, so a province edge moves by a few metres and a
//      handful of panoramas fall outside the shape they are served for.
//   2. Assign each survivor to a district, and count distinct places per
//      district so playability can be judged on somewhere-new rather than on a
//      raw count inflated ~30x by 33m thinning.
//
// Writes src/data/regions/counts.js, which src/lib/regions.js joins onto the
// tree. Kept separate from the tree itself so each generated file has exactly
// one writer.

import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import * as turf from '@turf/turf';
import { REGIONS } from '../src/data/regions/index.js';
import {
  assignPanos,
  cellKey,
  coverageVerdict,
  loadBoundary,
} from './lib/assign-districts.mjs';
import { PANO_DIR, TREE_DIR } from './lib/paths.mjs';

const childrenOf = (code) => REGIONS[code]?.children ?? [];
const provinces = () => childrenOf('VN');

/**
 * Re-clip and repartition one province's index.
 * @param {string} code Province code.
 * @returns {Object} Per-region stats for this province.
 */
function partition(code) {
  const path = `${PANO_DIR}/${code.toLowerCase()}.json`;
  const index = JSON.parse(readFileSync(path, 'utf8'));
  const boundary = loadBoundary(code);
  const [west, south, east, north] = boundary.properties.bbox;

  const kept = index.panos.filter((p) => {
    if (p.lat < south || p.lat > north || p.lng < west || p.lng > east) return false;
    return turf.booleanPointInPolygon(turf.point([p.lng, p.lat]), boundary);
  });
  const dropped = index.panos.length - kept.length;

  // Only districts with a boundary can take a panorama. An unresolved one --
  // Cu Chi has no OSM relation left -- stays in the tree but owns nothing.
  const leaves = childrenOf(code).filter((leaf) => REGIONS[leaf].bbox);
  const { assignments, counts, cells, stranded, unassigned, worstStrandedKm } = assignPanos(
    kept,
    leaves
  );

  const districts = leaves;
  const districtIndex = Object.fromEntries(districts.map((leaf, i) => [leaf, i]));

  const header = {
    code,
    name: boundary.properties.name,
    center: boundary.properties.center,
    bbox: boundary.properties.bbox,
    count: kept.length,
    districts,
    districtCounts: counts,
    districtCells: cells,
    stranded,
    worstStrandedKm,
    unassigned,
    source: index.source,
    grid: index.grid,
    generatedAt: index.generatedAt,
    assignedAt: new Date().toISOString(),
  };

  // Written by hand rather than through JSON.stringify's indent option: one
  // panorama per line keeps a six-figure list diffable, where a fully indented
  // file would run to millions of lines. `d` is an index into districts[]
  // rather than the code itself -- about 5 bytes per entry instead of 12, which
  // over 424,691 entries is worth the indirection.
  const body =
    Object.entries(header)
      .map(([key, value]) => ` ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
      .join('\n') +
    '\n "panos": [\n' +
    kept
      .map((p, i) => {
        const d = assignments[i];
        const suffix = d === null ? '' : `,"d":${districtIndex[d]}`;
        return `  {"id":${JSON.stringify(p.id)},"lat":${p.lat},"lng":${p.lng}${suffix}}`;
      })
      .join(',\n') +
    '\n ]\n';

  writeFileSync(path, `{\n${body}}\n`);

  const provinceCells = new Set(kept.map(cellKey));
  return {
    dropped,
    stranded,
    worstStrandedKm,
    // The cell KEYS travel, not just the count: cellKey is a global lat/lng
    // grid, so neighbouring provinces share cells along their border (Duc Hoa
    // abuts Ho Chi Minh City) and the country total has to be a union, not a
    // sum, or it overstates coverage.
    provinceCellKeys: provinceCells,
    stats: {
      [code]: { panos: kept.length, cells: provinceCells.size },
      ...Object.fromEntries(
        districts.map((leaf) => [leaf, { panos: counts[leaf], cells: cells[leaf] }])
      ),
    },
  };
}

/**
 * Write the per-region counts the UI reads.
 *
 * Client-safe: numbers and flags only, never coordinates.
 * @param {Object} stats Per-region {panos, cells}.
 */
function writeCounts(stats) {
  // Every node gets an entry, including ones with nothing, so the UI can tell
  // "no coverage" from "unknown".
  const rows = Object.keys(REGIONS).map((code) => {
    const { panos = 0, cells = 0 } = stats[code] ?? {};
    return { code, panos, cells, ...coverageVerdict(panos, cells) };
  });

  const body =
    '// Generated by scripts/assign-pano-districts.mjs. Do not edit by hand.\n' +
    '//\n' +
    '// Coverage per region: how many panoramas, and how many distinct ~1.1km\n' +
    '// cells they occupy. Cells matter because the index is thinned at 33m, so\n' +
    '// a raw count overstates distinct places by roughly 30x -- a district can\n' +
    '// look well covered while being one street seen from many angles.\n' +
    '//\n' +
    '// Safe to import from a client component: numbers and flags, no coordinates.\n\n' +
    'export const REGION_COUNTS = {\n' +
    rows
      .map(
        (r) =>
          `  ${JSON.stringify(r.code)}: { panos: ${r.panos}, cells: ${r.cells}, ` +
          `playable: ${r.playable}, thin: ${r.thin} },`
      )
      .join('\n') +
    '\n};\n';

  mkdirSync(TREE_DIR, { recursive: true });
  writeFileSync(`${TREE_DIR}/counts.js`, body);
}

// -- run ---------------------------------------------------------------------

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const codes = requested.length ? requested : provinces();

const stats = {};
const countryCells = new Set();
let totalDropped = 0;
let totalStranded = 0;
let totalPanos = 0;

for (const code of codes) {
  const { dropped, stranded, worstStrandedKm, provinceCellKeys, stats: provinceStats } =
    partition(code);
  Object.assign(stats, provinceStats);
  for (const cell of provinceCellKeys) countryCells.add(cell);
  totalDropped += dropped;
  totalStranded += stranded;
  totalPanos += stats[code].panos;

  const mb = (statSync(`${PANO_DIR}/${code.toLowerCase()}.json`).size / 1e6).toFixed(1);
  const leaves = childrenOf(code);
  const empty = leaves.filter((leaf) => !(stats[leaf]?.panos > 0));
  const strandedPct = ((stranded / Math.max(1, stats[code].panos)) * 100).toFixed(2);
  console.log(
    `${code.padEnd(6)} ${String(stats[code].panos).padStart(7)} panos in ` +
      `${String(stats[code].cells).padStart(4)} cells, ` +
      `${leaves.length - empty.length}/${leaves.length} districts covered, ` +
      `${stranded} stranded (${strandedPct}%, worst ${worstStrandedKm}km)` +
      (dropped ? `, ${dropped} re-clipped out` : '') +
      `  (${mb} MB)`
  );
  for (const leaf of empty) {
    const why = REGIONS[leaf].bbox ? 'no street imagery' : 'no boundary';
    console.log(`         ${leaf}: empty (${why})`);
  }
}

// A partial run knows nothing about the provinces it skipped, and writeCounts
// emits a row for every region in the tree. Writing here would zero coverage
// for everything not named on the command line -- and the test suite would
// still pass, because it iterates whatever playableRegions() reports.
if (requested.length) {
  console.log(
    `\npartial run (${codes.join(', ')}): indexes rewritten, ` +
      `${TREE_DIR}/counts.js left alone. Re-run with no arguments to refresh it.`
  );
  process.exit(0);
}

// Roll coverage up so the country reports what is reachable beneath it. Cells
// are a union rather than a sum: the grid is global, so provinces that touch
// share cells along the border.
stats.VN = {
  panos: provinces().reduce((total, code) => total + (stats[code]?.panos ?? 0), 0),
  cells: countryCells.size,
};

writeCounts(stats);

const playable = Object.keys(REGIONS).filter((code) => {
  const { panos = 0, cells = 0 } = stats[code] ?? {};
  return coverageVerdict(panos, cells).playable;
});
console.log(`\n${playable.length} of ${Object.keys(REGIONS).length} regions playable`);
if (totalDropped) console.log(`${totalDropped} panoramas re-clipped out in total`);

// The quality gate. A rising stranded rate means the leaf simplification
// tolerance in build-region-boundaries.mjs has opened gaps along shared
// borders, and those points are being placed by proximity rather than by
// containment. Re-running costs nothing, so fail loudly rather than shipping it.
const strandedPct = (totalStranded / Math.max(1, totalPanos)) * 100;
console.log(`${totalStranded} stranded of ${totalPanos} (${strandedPct.toFixed(2)}%)`);
if (strandedPct > 2) {
  throw new Error(
    `${strandedPct.toFixed(2)}% of panoramas fell outside every district polygon. ` +
      'Tighten LEAF_TOLERANCE in scripts/build-region-boundaries.mjs and rebuild.'
  );
}

console.log(`counts -> ${TREE_DIR}/counts.js`);
