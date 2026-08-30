// Access to the prebuilt panorama indexes.
//
// Each province ships a list of known panorama ids, their coordinates, and the
// district each one sits in, built offline by scripts/build-pano-index.mjs and
// scripts/assign-pano-districts.mjs. Picking from a list we already hold
// replaces asking the Graph API what is near a random point, which fails
// outright in dense districts and takes seconds where it works.
//
// SERVER-SIDE ONLY. These files are ~28MB of exact answers; importing them from
// anywhere the browser can reach hands every round's solution to the player.
// src/lib/regions.js is the client-safe view of the same tree and deliberately
// imports nothing from here -- tests/regions.test.js enforces that boundary.

import { PANO_INDEXES } from '../data/panos/index.js';
import { getRegion, childrenOf, provinceOf, provinces, isPlayable } from './regions.js';

/**
 * The whole index for a province.
 * @param {string} provinceCode Province code, e.g. 'TPHCM'.
 * @returns {Object} The index, including its panos array.
 */
export function getProvinceIndex(provinceCode) {
  const index = PANO_INDEXES[provinceCode];
  if (!index) {
    throw new Error(
      `No panorama index for province: ${provinceCode}. ` +
        'Run: node scripts/build-pano-index.mjs ' + provinceCode
    );
  }
  if (!index.panos?.length) throw new Error(`Panorama index for ${provinceCode} is empty`);
  return index;
}

// Per-district buckets, built once per province on first use. Process-global
// and never invalidated, which is correct: the data is static and bundled. It
// retains one reference per panorama, bounded by the index that is already
// resident, so it is not a leak.
const bucketCache = new Map();

/**
 * Every panorama in one district.
 * @param {string} districtCode District code, e.g. 'TPHCM-Q7'.
 * @returns {Object[]} Panoramas, possibly empty.
 */
function districtPanos(districtCode) {
  const province = provinceOf(districtCode);
  if (!bucketCache.has(province)) {
    const index = getProvinceIndex(province);
    const buckets = new Map(index.districts.map((code) => [code, []]));
    for (const pano of index.panos) {
      // `d` indexes into the header's districts array; absent means the point
      // fell outside every district polygon and belongs to the province only.
      if (pano.d === undefined) continue;
      buckets.get(index.districts[pano.d])?.push(pano);
    }
    // Frozen because these are handed out by getRegionPanos and cached for the
    // life of the process. A caller sorting or splicing one would silently
    // reorder it for every later draw -- and on a province array would
    // desynchronise every `d` offset. A comment alone did not prevent exactly
    // this bug once already.
    for (const bucket of buckets.values()) Object.freeze(bucket);
    bucketCache.set(province, buckets);
  }
  return bucketCache.get(province).get(districtCode) ?? EMPTY;
}

const EMPTY = Object.freeze([]);

/**
 * Every panorama at or below a region.
 *
 * Not defined for the country: materialising all 424,691 entries to draw one
 * would be wasteful, and pickRandomPano handles that level by delegating.
 * @param {string} code Region code.
 * @returns {Object[]} Panoramas.
 */
export function getRegionPanos(code) {
  const { level } = getRegion(code);
  if (level === 'province') return Object.freeze(getProvinceIndex(code).panos);
  if (level === 'district') return districtPanos(code);
  throw new Error(`getRegionPanos does not materialise ${level} level: ${code}`);
}

/**
 * Pick a random panorama at or below a region, and say which district it is in.
 *
 * The district matters more than it looks: it is what a guess is credited to,
 * and it has to be resolved here rather than trusted from the client.
 * @param {string} code Region code, at any level.
 * @param {Set<string>} excludeIds Ids to avoid, e.g. ones already tried.
 * @returns {{id: string, lat: number, lng: number, regionCode: string}} The choice.
 */
export function pickRandomPano(code, excludeIds = new Set()) {
  const { level } = getRegion(code);

  if (level === 'country') {
    // Uniform over provinces, not over panoramas. Ha Noi and Ho Chi Minh hold
    // 97% of the index between them, so a panorama-uniform draw would make
    // "anywhere in Vietnam" mean "Ha Noi or Ho Chi Minh" and put Da Lat at one
    // round in a thousand.
    const usable = childrenOf(code).filter(
      (child) => isPlayable(child) && getRegionPanos(child).some((p) => !excludeIds.has(p.id))
    );
    if (usable.length === 0) throw new Error(`No panoramas left to try for ${code}`);
    return pickRandomPano(usable[Math.floor(Math.random() * usable.length)], excludeIds);
  }

  const panos = getRegionPanos(code);
  if (panos.length === 0) throw new Error(`No panoramas left to try for ${code}`);

  // Rejection sampling rather than filtering. excludeIds holds at most the two
  // ids already tried this round, so a few redraws beat allocating a fresh
  // 226k-element array per retry. Falls back to the filter once misses suggest
  // the pool really is nearly exhausted.
  let chosen = null;
  for (let attempt = 0; attempt < 8 && chosen === null; attempt++) {
    const candidate = panos[Math.floor(Math.random() * panos.length)];
    if (!excludeIds.has(candidate.id)) chosen = candidate;
  }
  if (chosen === null) {
    const usable = panos.filter((p) => !excludeIds.has(p.id));
    if (usable.length === 0) throw new Error(`No panoramas left to try for ${code}`);
    chosen = usable[Math.floor(Math.random() * usable.length)];
  }
  return {
    id: chosen.id,
    lat: chosen.lat,
    lng: chosen.lng,
    // A province draw can land on a panorama outside every district polygon,
    // in which case the province is the finest level it can be credited to.
    regionCode:
      level === 'district'
        ? code
        : chosen.d === undefined
          ? code
          : getProvinceIndex(code).districts[chosen.d],
  };
}

/**
 * How many panoramas a region holds. Useful for diagnostics.
 * @param {string} code Region code.
 * @returns {number} Count.
 */
export function countPanos(code) {
  const { level } = getRegion(code);
  if (level === 'country') {
    return provinces().reduce((total, province) => total + countPanos(province), 0);
  }
  return getRegionPanos(code).length;
}

/**
 * Province codes that currently have an index built.
 * @returns {string[]} Codes.
 */
export function indexedProvinces() {
  return Object.keys(PANO_INDEXES);
}
