// Build the panorama index each city plays from.
//
// The Graph API's /images?bbox= endpoint is unusable for this: it returns HTTP
// 500 in dense areas whatever the window size or limit, and takes seconds where
// it does work. The vector tile API answers everywhere, so coverage is
// discovered here, once, and the runtime is left with a single by-ID lookup.
//
//   node scripts/build-pano-index.mjs           # every city
//   node scripts/build-pano-index.mjs TPHCM DN  # only these
//
// Needs MAPILLARY_ACCESS_TOKEN in .env, and the boundaries built first by
// scripts/build-city-boundaries.mjs. Output is src/data/panos/<code>.json,
// which is plain JSON and safe to prune by hand.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import * as turf from '@turf/turf';

// The image layer, the one carrying per-image points, only exists at z14.
const ZOOM = 14;
const TILE_URL = 'https://tiles.mapillary.com/maps/vtp/mly1_public/2';
// Tiles run to ~9MB in dense districts, so a few at a time is plenty.
const CONCURRENCY = 4;
// tiles.mapillary.com allows 50,000 requests per day, and a full rebuild of
// every city costs about 2,800. That is comfortable for occasional use but not
// unlimited: roughly seventeen full rebuilds exhaust a day's budget. Exceeding
// it returns 4xx, so failures are retried and a build that still cannot get
// every tile refuses to write, rather than quietly shipping a partial snapshot.
const TILE_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;
// One panorama per cell, so rounds spread out instead of stacking up on
// whichever street was driven most. Coverage is heavily clustered along a few
// roads, so the cell has to be small or a whole city collapses to a handful of
// locations: Da Lat's 4,309 panoramas fall in only 86 cells at 165m.
// ~0.0003 degrees is roughly 33m, far enough apart to look like a new place.
const GRID_DEG = 0.0003;
// No cap: the index keeps every distinct location Mapillary has inside the
// city. Capping was only ever a file-size measure, and it did not affect
// coverage -- the cells that hold imagery are saturated, so a sample and the
// full set reach the same places. It did cost density.
const MAX_PER_CITY = Infinity;

const BOUNDARY_DIR = 'src/data/boundaries';
const OUT_DIR = 'src/data/panos';

function loadToken() {
  const env = Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      })
  );
  const token = env.MAPILLARY_ACCESS_TOKEN;
  if (!token) throw new Error('MAPILLARY_ACCESS_TOKEN missing from .env');
  return token;
}

/** Web-mercator tile containing a coordinate. */
function tileFor(lng, lat, zoom) {
  const scale = 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * scale),
    y: Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale),
  };
}

/** Every tile covering a bbox at one zoom. */
function tilesForBbox([west, south, east, north], zoom) {
  const topLeft = tileFor(west, north, zoom);
  const bottomRight = tileFor(east, south, zoom);
  const tiles = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) tiles.push({ x, y, z: zoom });
  }
  return tiles;
}

/**
 * Fetch one tile and return its panorama points.
 * @param {Object} tile Tile coordinates.
 * @param {string} token Mapillary access token.
 * @returns {Promise<{points: Object[], bytes: number}>}
 */
async function fetchPanoPoints(tile, token) {
  const url = `${TILE_URL}/${tile.z}/${tile.x}/${tile.y}?access_token=${token}`;

  let response = null;
  let lastError = null;
  for (let attempt = 1; attempt <= TILE_RETRIES; attempt++) {
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (response.ok) break;
      // 429 and the other 4xx the tile API uses for an exhausted quota are
      // worth waiting on; a 404 is not, but retrying three times costs little.
      lastError = `HTTP ${response.status}`;
      response = null;
    } catch (error) {
      lastError = error.name === 'TimeoutError' ? 'timeout' : String(error.message).slice(0, 80);
    }
    if (attempt < TILE_RETRIES) await sleep(RETRY_BACKOFF_MS * attempt);
  }
  if (!response) throw new Error(`tile ${tile.x}/${tile.y}: ${lastError}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const layer = new VectorTile(new PbfReader(buffer)).layers.image;
  if (!layer) return { points: [], bytes: buffer.length };

  const points = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (!feature.properties.is_pano) continue;
    const [lng, lat] = feature.toGeoJSON(tile.x, tile.y, tile.z).geometry.coordinates;
    points.push({
      id: String(feature.properties.id),
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      capturedAt: feature.properties.captured_at ?? null,
    });
  }
  return { points, bytes: buffer.length };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run tasks with a fixed number in flight. */
async function inBatches(items, size, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(worker))));
  }
  return results;
}

/**
 * Keep one panorama per grid cell so locations are spread, not clustered.
 * @param {Object[]} points Candidate panoramas.
 * @returns {Object[]} Thinned set.
 */
function thinToGrid(points) {
  const kept = new Map();
  for (const point of points) {
    const cell = `${Math.floor(point.lat / GRID_DEG)}:${Math.floor(point.lng / GRID_DEG)}`;
    // Prefer the most recent capture in a cell; newer imagery tends to be better.
    const existing = kept.get(cell);
    if (!existing || (point.capturedAt ?? 0) > (existing.capturedAt ?? 0)) {
      kept.set(cell, point);
    }
  }
  return [...kept.values()];
}

async function buildCity(code, token) {
  const boundaryPath = `${BOUNDARY_DIR}/${code.toLowerCase()}.json`;
  if (!existsSync(boundaryPath)) {
    throw new Error(`${code}: missing ${boundaryPath} — run build-city-boundaries.mjs first`);
  }
  const boundary = JSON.parse(readFileSync(boundaryPath, 'utf8'));
  const bbox = boundary.properties.bbox ?? turf.bbox(boundary);
  const tiles = tilesForBbox(bbox, ZOOM);
  tilesRequested += tiles.length;

  console.log(
    `\n${code} — ${boundary.properties.name}: ${tiles.length} tiles at z${ZOOM} ` +
      `(${tilesRequested} this run, of 50,000/day)`
  );

  let done = 0;
  let totalBytes = 0;
  let failed = 0;
  const raw = [];

  await inBatches(tiles, CONCURRENCY, async (tile) => {
    try {
      const { points, bytes } = await fetchPanoPoints(tile, token);
      raw.push(...points);
      totalBytes += bytes;
    } catch (error) {
      failed++;
      console.warn(`  ${error.message}`);
    }
    done++;
    if (done % 5 === 0 || done === tiles.length) {
      process.stdout.write(
        `\r  ${done}/${tiles.length} tiles, ${raw.length} panoramas, ` +
          `${(totalBytes / 1e6).toFixed(0)} MB   `
      );
    }
  });
  process.stdout.write('\n');
  if (failed > 0) {
    // Writing here would produce a snapshot with holes that nothing downstream
    // could distinguish from genuinely absent coverage.
    throw new Error(
      `${code}: ${failed} of ${tiles.length} tiles could not be fetched, so the ` +
        'index would be incomplete. Nothing written. If this is the daily tile ' +
        'quota (50,000/day), wait and re-run.'
    );
  }

  // Tiles cover the bbox, not the city, so drop anything outside the outline.
  const inside = raw.filter((p) =>
    turf.booleanPointInPolygon(turf.point([p.lng, p.lat]), boundary)
  );
  console.log(`  ${inside.length} inside the boundary (of ${raw.length})`);

  let panos = thinToGrid(inside);
  console.log(`  ${panos.length} after grid thinning at ${GRID_DEG} deg`);

  if (panos.length > MAX_PER_CITY) {
    // Shuffle before truncating, so a cap does not bias towards one corner.
    for (let i = panos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [panos[i], panos[j]] = [panos[j], panos[i]];
    }
    panos = panos.slice(0, MAX_PER_CITY);
    console.log(`  capped to ${MAX_PER_CITY}`);
  }

  if (panos.length === 0) throw new Error(`${code}: no panoramas found`);

  panos.sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  panos = panos.map(({ id, lat, lng }) => ({ id, lat, lng }));

  const header = {
    code,
    name: boundary.properties.name,
    center: boundary.properties.center,
    bbox: boundary.properties.bbox,
    count: panos.length,
    source: `mapillary vector tiles z${ZOOM}`,
    grid: GRID_DEG,
    generatedAt: new Date().toISOString(),
  };

  // Written by hand rather than through JSON.stringify's indent option: one
  // panorama per line keeps a six-figure list diffable and editable, where a
  // fully indented file would run to millions of lines.
  const body =
    Object.entries(header)
      .map(([key, value]) => ` ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
      .join('\n') +
    '\n "panos": [\n' +
    panos
      .map((p) => `  {"id":${JSON.stringify(p.id)},"lat":${p.lat},"lng":${p.lng}}`)
      .join(',\n') +
    '\n ]\n';

  mkdirSync(OUT_DIR, { recursive: true });
  const path = `${OUT_DIR}/${code.toLowerCase()}.json`;
  writeFileSync(path, `{\n${body}}\n`);
  const mb = (statSync(path).size / 1e6).toFixed(1);
  console.log(`  -> ${path}  ${panos.length} panoramas, ${mb} MB`);
}

/**
 * Rewrite the barrel module that lib/pano-index.js imports.
 *
 * Static imports let the indexes be bundled with the server build, but they
 * also mean a city whose file has not been generated yet is a hard build error.
 * Generating the import list from what is actually on disk keeps a partial
 * build usable.
 * @returns {string[]} City codes now in the barrel.
 */
function writeBarrel() {
  const files = readdirSync(OUT_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
  const entries = files.map((name) => ({
    code: name.replace(/\.json$/, '').toUpperCase(),
    ident: name.replace(/\.json$/, ''),
    file: name,
  }));

  const body =
    '// Generated by scripts/build-pano-index.mjs. Do not edit by hand.\n' +
    '//\n' +
    '// Lists only the city indexes that have actually been built, so a partial\n' +
    '// build still compiles.\n\n' +
    entries.map((e) => `import ${e.ident} from './${e.file}';`).join('\n') +
    '\n\nexport const PANO_INDEXES = {\n' +
    entries.map((e) => `  ${e.code}: ${e.ident},`).join('\n') +
    '\n};\n';

  writeFileSync(`${OUT_DIR}/index.js`, body);
  return entries.map((e) => e.code);
}

let tilesRequested = 0;

const token = loadToken();
const requested = process.argv.slice(2);
const codes = requested.length ? requested : ['HN', 'TPHCM', 'DN', 'DL', 'DH'];
for (const code of codes) {
  await buildCity(code, token);
  // Rewrite after every city, so an interrupted run still leaves a consistent
  // barrel behind.
  writeBarrel();
}
console.log(`\nbarrel: ${writeBarrel().join(', ')}`);
console.log('done');
