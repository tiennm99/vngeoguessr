// Access to the panorama index, served from Neon Postgres.
//
// The index lists known Mapillary panorama ids, their coordinates, and the
// district each one sits in, built offline by scripts/build-pano-index.mjs and
// scripts/assign-pano-districts.mjs and pushed by scripts/seed-pano-db.mjs.
// Picking from rows we already hold replaces asking the Graph API what is near
// a random point, which fails outright in dense districts and takes seconds
// where it works.
//
// SERVER-SIDE ONLY. The rows are exact round answers; a client that could read
// them holds every solution. src/lib/regions.js is the client-safe view of the
// region tree and imports nothing from here or pano-db.js --
// tests/regions.test.js enforces that boundary.

import { getPanoDb, query } from './pano-db.js';
import { getRegion, childrenOf, isPlayable } from './regions.js';

/**
 * WHERE clause for one region. The country has no predicate of its own;
 * callers handle that level by iterating provinces.
 * @param {string} code Region code, province or district level.
 * @returns {string} Predicate with the code as $1.
 */
function regionPredicate(code) {
  const { level } = getRegion(code);
  if (level === 'province') return 'province = $1';
  if (level === 'district') return 'district = $1';
  throw new Error(`No SQL predicate for ${level} level: ${code}`);
}

// Region code -> row count, filled on first use and kept for the life of the
// process. The table only changes when the seed script runs, and deploys and
// serverless recycling restart the process far more often than the data
// changes -- the same staleness contract the bundled JSON had.
const countCache = new Map();

/**
 * How many panoramas a region holds.
 * @param {string} code Region code at any level.
 * @returns {Promise<number>} Count.
 */
export async function countPanos(code) {
  const { level } = getRegion(code);
  if (level === 'country') {
    let total = 0;
    for (const child of childrenOf(code)) total += await countPanos(child);
    return total;
  }
  if (countCache.has(code)) return countCache.get(code);
  const rows = await query(
    getPanoDb(),
    `SELECT count(*)::int AS n FROM panoramas WHERE ${regionPredicate(code)}`,
    [code]
  );
  const n = rows[0].n;
  countCache.set(code, n);
  return n;
}

/**
 * Shape one row as the choice pickRandomPano returns.
 *
 * The district matters more than it looks: it is what a guess is credited to,
 * and it has to be resolved here rather than trusted from the client. A
 * province draw can land on a row outside every district polygon (district
 * NULL), in which case the province is the finest level it can be credited to.
 * @param {Object} row Panorama row.
 * @param {string} code The region that was drawn from.
 * @param {string} level That region's level.
 * @returns {{id: string, lat: number, lng: number, regionCode: string}}
 */
function toChoice(row, code, level) {
  return {
    id: row.id,
    lat: Number(row.lat),
    lng: Number(row.lng),
    regionCode: level === 'district' ? code : row.district ?? code,
  };
}

/**
 * Pick a random panorama at or below a region, and say which district it is in.
 * @param {string} code Region code, at any level.
 * @param {Set<string>} excludeIds Ids to avoid, e.g. ones already tried.
 * @returns {Promise<{id: string, lat: number, lng: number, regionCode: string}>}
 */
export async function pickRandomPano(code, excludeIds = new Set()) {
  const { level } = getRegion(code);

  if (level === 'country') {
    // Uniform over provinces, not over panoramas. Ha Noi and Ho Chi Minh hold
    // 97% of the index between them, so a panorama-uniform draw would make
    // "anywhere in Vietnam" mean "Ha Noi or Ho Chi Minh" and put Da Lat at one
    // round in a thousand. A province whose pool is empty or fully excluded
    // just falls out of the draw, same as the old usable-first filter.
    const candidates = childrenOf(code).filter((child) => isPlayable(child));
    while (candidates.length > 0) {
      const i = Math.floor(Math.random() * candidates.length);
      const [child] = candidates.splice(i, 1);
      try {
        return await pickRandomPano(child, excludeIds);
      } catch (error) {
        // Only a dry pool falls through to the next province. A connection or
        // query failure would hit all five identically, and five retries would
        // just relabel it "no panoramas left".
        if (!String(error.message).startsWith('No panoramas left')) throw error;
      }
    }
    throw new Error(`No panoramas left to try for ${code}`);
  }

  const where = regionPredicate(code);
  let total = await countPanos(code);
  if (total === 0) throw new Error(`No panoramas left to try for ${code}`);

  // Rejection sampling rather than filtering. excludeIds holds at most the two
  // ids already tried this round, so a few redraws beat shipping the exclusion
  // into every query. Falls back to a filtered draw once misses suggest the
  // pool really is nearly exhausted.
  for (let attempt = 0; attempt < 8; attempt++) {
    const offset = Math.floor(Math.random() * total);
    const rows = await query(
      getPanoDb(),
      `SELECT id, lat, lng, district FROM panoramas
       WHERE ${where} ORDER BY id OFFSET $2 LIMIT 1`,
      [code, offset]
    );
    if (rows.length === 0) {
      // The offset overshot: the cached count is stale because a --province
      // reseed shrank this region. Refresh once instead of burning the whole
      // retry budget on it, every round, until the process recycles.
      countCache.delete(code);
      total = await countPanos(code);
      if (total === 0) throw new Error(`No panoramas left to try for ${code}`);
      continue;
    }
    if (!excludeIds.has(rows[0].id)) {
      return toChoice(rows[0], code, level);
    }
  }

  const ids = [...excludeIds];
  const usableRows = await query(
    getPanoDb(),
    `SELECT count(*)::int AS n FROM panoramas
     WHERE ${where} AND NOT (id = ANY($2::text[]))`,
    [code, ids]
  );
  const usable = usableRows[0].n;
  if (usable === 0) throw new Error(`No panoramas left to try for ${code}`);
  const offset = Math.floor(Math.random() * usable);
  const rows = await query(
    getPanoDb(),
    `SELECT id, lat, lng, district FROM panoramas
     WHERE ${where} AND NOT (id = ANY($2::text[])) ORDER BY id OFFSET $3 LIMIT 1`,
    [code, ids, offset]
  );
  return toChoice(rows[0], code, level);
}

/**
 * An evenly spaced sample of a region's panoramas, for the coverage debug page.
 *
 * Sampling happens in SQL: Ha Noi holds 225,966 rows, which is far more than a
 * map can draw or a response should carry. Rows are striped by latitude rank,
 * so every stripe covers the whole region rather than one corner.
 * @param {string} code Region code, province or district level.
 * @param {number|null} west Viewport bbox, or null for the whole region.
 * @param {number|null} south Viewport bbox.
 * @param {number|null} east Viewport bbox.
 * @param {number|null} north Viewport bbox.
 * @param {number} limit Maximum rows to return.
 * @returns {Promise<{panos: Object[], total: number, inView: number}>}
 */
export async function getRegionPanoSample(code, west, south, east, north, limit) {
  const where = regionPredicate(code);
  const hasBbox = [west, south, east, north].every(Number.isFinite);
  const bboxClause = hasBbox
    ? ' AND lat BETWEEN $2 AND $3 AND lng BETWEEN $4 AND $5'
    : '';
  const params = hasBbox ? [code, south, north, west, east] : [code];

  const total = await countPanos(code);
  const inViewRows = hasBbox
    ? await query(
        getPanoDb(),
        `SELECT count(*)::int AS n FROM panoramas WHERE ${where}${bboxClause}`,
        params
      )
    : null;
  const inView = hasBbox ? inViewRows[0].n : total;

  // floor, not ceil: a ceil stride can return as little as half of `limit`
  // (12,001 rows at limit 12,000 -> stride 2 -> 6,001 points). Flooring
  // over-selects slightly and lets LIMIT cap it, at the cost of a small
  // southern bias invisible at map resolution.
  const stride = Math.max(1, Math.floor(inView / limit));
  const rows = await query(
    getPanoDb(),
    `SELECT id, lat, lng FROM (
       SELECT id, lat, lng, row_number() OVER (ORDER BY lat, id) AS rn
       FROM panoramas WHERE ${where}${bboxClause}
     ) striped WHERE (rn - 1) % $${params.length + 1} = 0
     ORDER BY rn LIMIT $${params.length + 2}`,
    [...params, stride, limit]
  );

  return {
    panos: rows.map((row) => ({ id: row.id, lat: Number(row.lat), lng: Number(row.lng) })),
    total,
    inView,
  };
}

/**
 * Per-province index metadata, recorded at seed time.
 * @param {string} provinceCode Province code, e.g. 'TPHCM'.
 * @returns {Promise<{code: string, count: number, generatedAt: string|null, assignedAt: string|null}|null>}
 */
export async function getProvinceMeta(provinceCode) {
  const rows = await query(
    getPanoDb(),
    'SELECT code, count, generated_at, assigned_at FROM pano_provinces WHERE code = $1',
    [provinceCode]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    code: row.code,
    count: Number(row.count),
    // Neon returns timestamptz as an ISO string, PGlite as a Date; normalise.
    generatedAt: row.generated_at ? new Date(row.generated_at).toISOString() : null,
    assignedAt: row.assigned_at ? new Date(row.assigned_at).toISOString() : null,
  };
}

/**
 * Province codes that currently have an index seeded.
 * @returns {Promise<string[]>} Codes.
 */
export async function indexedProvinces() {
  const rows = await query(getPanoDb(), 'SELECT code FROM pano_provinces ORDER BY code', []);
  return rows.map((row) => row.code);
}
