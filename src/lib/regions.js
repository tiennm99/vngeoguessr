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
