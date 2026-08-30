// Navigation over the region tree: country > province > district.
//
// Client-safe by construction. This module imports the generated tree and the
// generated panorama counts and NOTHING else -- in particular never
// pano-index.js or src/data/panos/, which together are ~25MB of exact
// panorama coordinates. A client component that reached those would ship every
// answer to the browser. tests/regions.test.js enforces the boundary.
//
// Scores roll upward: a guess resolves to the leaf its panorama sits in, and
// credits that leaf, its province, and the country. ancestorsOf() is what the
// leaderboard fans out over.

import { REGIONS } from '../data/regions/index.js';
import { REGION_COUNTS } from '../data/regions/counts.js';

export const COUNTRY_CODE = 'VN';

/**
 * One region node.
 * @param {string} code Region code, e.g. 'TPHCM-Q7'.
 * @returns {Object} The node.
 */
export function getRegion(code) {
  const region = REGIONS[code];
  if (!region) {
    throw new Error(
      `Unknown region: ${code}. Known codes: ${Object.keys(REGIONS).join(', ')}`
    );
  }
  return region;
}

/** True when the code names a region, without throwing. */
export function isRegion(code) {
  return Boolean(code && REGIONS[code]);
}

/**
 * The node and every ancestor above it, ending at the country.
 *
 * This is the fan-out chain: a guess in TPHCM-Q7 credits
 * ['TPHCM-Q7', 'TPHCM', 'VN'].
 * @param {string} code Region code.
 * @returns {string[]} Codes, self first.
 */
export function ancestorsOf(code) {
  const chain = [];
  let current = getRegion(code);
  while (current) {
    chain.push(current.code);
    current = current.parent ? getRegion(current.parent) : null;
  }
  return chain;
}

/**
 * Direct children of a node.
 * @param {string} code Region code.
 * @returns {string[]} Child codes, empty for a leaf.
 */
export function childrenOf(code) {
  return getRegion(code).children ?? [];
}

/**
 * Every leaf at or below a node. A leaf is its own only leaf.
 * @param {string} code Region code.
 * @returns {string[]} Leaf codes.
 */
export function leavesUnder(code) {
  const children = childrenOf(code);
  if (children.length === 0) return [code];
  return children.flatMap((child) => leavesUnder(child));
}

/**
 * The province a node belongs to.
 * @param {string} code Region code.
 * @returns {string|null} Province code, or null for the country itself.
 */
export function provinceOf(code) {
  return ancestorsOf(code).find((c) => getRegion(c).level === 'province') ?? null;
}

/** Every province, in declaration order. */
export function provinces() {
  return childrenOf(COUNTRY_CODE);
}

/**
 * Ancestor names, country first, for a UI header or a result reveal.
 *
 * Only safe to show the resolved leaf's path AFTER a guess: before it, the
 * district names the answer.
 * @param {string} code Region code.
 * @returns {string[]} Names, outermost first.
 */
export function regionPath(code) {
  return ancestorsOf(code)
    .reverse()
    .map((c) => getRegion(c).name);
}

/** Every node in the tree, in declaration order. */
export function allRegions() {
  return Object.keys(REGIONS);
}

/**
 * Coverage for a node: panorama count, distinct places, and whether it is
 * worth offering.
 *
 * `cells` counts distinct ~1.1km squares, and it is the number that matters.
 * The index is thinned at 33m, so a raw count overstates distinct places by
 * roughly 30x -- a district can hold hundreds of panoramas and still be one
 * street seen from many angles.
 * @param {string} code Region code.
 * @returns {{panos: number, cells: number, playable: boolean, thin: boolean}}
 */
export function coverageOf(code) {
  return REGION_COUNTS[code] ?? { panos: 0, cells: 0, playable: false, thin: false };
}

/** True when a node has enough coverage to play. */
export function isPlayable(code) {
  return coverageOf(code).playable;
}

/** True when a node is playable but repetitive -- a couple of streets. */
export function isThin(code) {
  return coverageOf(code).thin;
}

/**
 * Every node that can actually be played.
 * @returns {string[]} Playable region codes.
 */
export function playableRegions() {
  return Object.keys(REGIONS).filter(isPlayable);
}

/**
 * True when a node has no boundary because its OSM lookup did not resolve.
 *
 * Distinct from having no street imagery: an unresolved node never entered its
 * province's union, so its panoramas were clipped away at index-build time.
 * See the Coverage note in docs/project-overview.md.
 * @param {string} code Region code.
 * @returns {boolean} True when unresolved.
 */
export function isUnresolved(code) {
  return getRegion(code).coverage === 'unresolved';
}
