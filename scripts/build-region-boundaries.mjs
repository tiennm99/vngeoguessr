// Build the play-area polygon for every region and write it as GeoJSON, then
// generate the region tree the rest of the app navigates by.
//
// Vietnam merged its provinces in mid-2025, so the current administrative
// boundary for Ho Chi Minh City covers 36,566 km2 and reaches Vung Tau. That is
// not a guessable area: the scoring bands top out at 1km. These are the
// pre-merger extents instead, which is also why Duc Hoa sits under Long An
// rather than the Tay Ninh it was merged into.
//
//   node scripts/build-region-boundaries.mjs           # everything
//   node scripts/build-region-boundaries.mjs HN DN     # only these provinces
//
// Output:
//   src/data/boundaries/<province>/<code>.json   one per resolved leaf, plus
//                                                one per province
//   src/data/boundaries/index.js                 barrel
//   src/data/regions/index.js                    the tree: names, parents,
//                                                centers, bboxes, coverage flags
//
// Panorama counts live in src/data/regions/counts.js and are written by
// scripts/assign-pano-districts.mjs, not here.
//
// Coverage is deliberately partial and grows by adding entries below. A leaf
// Nominatim cannot resolve is recorded as unresolved rather than failing the
// build -- see the Coverage section of docs/project-overview.md for why absent
// coverage is not automatically a defect.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import * as turf from '@turf/turf';
import { BOUNDARY_DIR as OUT_DIR, TREE_DIR } from './lib/paths.mjs';
import { boundaryEntries, writeBarrelFile } from './lib/barrel.mjs';
import { REGION_CONFIG } from './lib/region-config.mjs';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Nominatim asks for a real identifier and at most one request per second.
const USER_AGENT = 'vngeoguessr/1.0 (https://github.com/tiennm99/vngeoguessr)';
const REQUEST_GAP_MS = 1100;

// Leaves are simplified tightly: at district scale a loose tolerance opens gaps
// along shared borders, and scripts/assign-pano-districts.mjs has to decide
// which side of those borders every panorama falls on.
//
// A province outline is simplified no more loosely than the leaves it is the
// union of, because it is not only drawn: assign-pano-districts.mjs clips each
// province's panoramas against it before handing them to the leaves. At a
// coarser tolerance the outline bulges past its own districts, and every
// panorama in that band survives the clip but lands in no district -- credited
// by proximity to a district it does not sit in. Binh Duong, small and densely
// covered along its edges, put 2.53% of its panoramas in that band at ~55m.
const LEAF_TOLERANCE = 0.0001; // ~11m

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Province directory a region's polygon lives in.
 *
 * Boundaries are grouped by province: 61 leaves plus 5 provinces in one flat
 * directory is unreadable, and every leaf belongs to exactly one province.
 * @param {string} code Region code.
 * @returns {string} Directory name, lowercased province code.
 */
function folderFor(code) {
  const config = REGION_CONFIG[code];
  // The country has no polygon of its own, so it has no home directory either.
  if (config.level === 'country') return null;
  const province = config.level === 'province' ? code : config.parent;
  return province.toLowerCase();
}

/**
 * Path a region's polygon lives under, relative to OUT_DIR.
 * @param {string} code Region code.
 * @returns {string|null} Path, or null for a region with no polygon.
 */
function fileFor(code) {
  const folder = folderFor(code);
  return folder ? `${folder}/${code.toLowerCase()}.json` : null;
}

/** Direct children of a node, in declaration order. */
function childrenOf(code) {
  return Object.keys(REGION_CONFIG).filter((key) => REGION_CONFIG[key].parent === code);
}

/**
 * The unqualified form of a query: "Huyện Ba Vì, Hà Nội, Việt Nam" becomes
 * "Huyện Ba Vì, Việt Nam".
 *
 * The 2025 restructure abolished the district level, and OSM has followed it:
 * the pre-2025 units now exist as boundary/historic relations whose rendered
 * parent is the CURRENT province, not the historic one. Qualifying such a query
 * with the historic city name therefore matches nothing, while the bare form
 * finds the relation. Quan (urban districts) mostly still match qualified, so
 * both forms are tried.
 * @param {string} query Fully qualified query.
 * @returns {string} Bare form.
 */
function bareForm(query) {
  const head = query.split(',')[0].trim();
  return `${head}, Việt Nam`;
}

/**
 * Look up one administrative area and return it as a turf feature.
 *
 * `box` is the parent's pre-2025 extent. It is the guard against the bare query
 * form matching a same-named unit elsewhere in the country: Nominatim happily
 * returns "Ba Vì District, Phú Thọ Province" for a Ha Noi lookup, and only the
 * geometry tells you whether it is the right Ba Vì.
 * @param {string} query Nominatim free-text query.
 * @param {number[]} box Parent bbox [west, south, east, north].
 * @returns {Promise<Object|null>} Feature, or null when nothing usable matched.
 */
async function lookupArea(query, box) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=10`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status} for "${query}"`);

  // A cemetery, a bus stop or a hospital of the same name can outrank the
  // district, so scan the candidates for one that is actually a boundary. Both
  // 'administrative' and 'historic' count: the pre-2025 units are historic now.
  for (const hit of await response.json()) {
    if (!hit?.geojson) continue;
    if (!['Polygon', 'MultiPolygon'].includes(hit.geojson.type)) continue;
    if (hit.class !== 'boundary') continue;
    if (box) {
      const [lat, lon] = [Number(hit.lat), Number(hit.lon)];
      const inside = lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3];
      if (!inside) continue;
    }
    return turf.feature(hit.geojson, { osm: `${hit.osm_type}/${hit.osm_id}` });
  }
  return null;
}

/**
 * Write one region's polygon to disk.
 * @param {string} code Region code.
 * @param {Object} geometry GeoJSON geometry.
 * @param {Object} extra Extra properties to record.
 * @returns {Object} The written feature.
 */
function writeBoundary(code, geometry, extra) {
  const config = REGION_CONFIG[code];
  const feature = turf.feature(geometry);
  const bbox = turf.bbox(feature).map((n) => Number(n.toFixed(5)));
  const centroid = turf.centerOfMass(feature).geometry.coordinates;

  const out = {
    type: 'Feature',
    properties: {
      code,
      name: config.name,
      level: config.level,
      parent: config.parent ?? null,
      // Recorded so a future reader knows why this is not the current
      // administrative boundary.
      basis: 'pre-2025-merger extent, from OSM boundary/historic relations',
      areaKm2: Number((turf.area(feature) / 1e6).toFixed(1)),
      bbox,
      center: config.center ?? [Number(centroid[1].toFixed(5)), Number(centroid[0].toFixed(5))],
      generatedAt: new Date().toISOString(),
      ...extra,
    },
    geometry,
  };

  const path = `${OUT_DIR}/${fileFor(code)}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
  return out;
}

/**
 * Resolve one leaf and write its polygon.
 * @param {string} code Leaf code.
 * @returns {Promise<boolean>} True when it resolved.
 */
async function buildLeaf(code) {
  const config = REGION_CONFIG[code];
  const box = REGION_CONFIG[config.parent]?.legacyBbox;

  // Qualified first, then bare. See bareForm() for why one form is not enough.
  const forms = [config.query];
  const bare = bareForm(config.query);
  if (bare !== config.query) forms.push(bare);

  let feature = null;
  for (const form of forms) {
    try {
      feature = await lookupArea(form, box);
    } catch (error) {
      console.error(`  ${code}: ${error.message}`);
    }
    await sleep(REQUEST_GAP_MS);
    if (feature) break;
  }

  if (!feature) {
    // Not fatal. An unresolved leaf is recorded in the tree and excluded from
    // play; see the Coverage note in docs/project-overview.md.
    console.warn(`  ${code} (${config.name}): no boundary found — UNRESOLVED`);
    return false;
  }

  const simplified = turf.simplify(feature, { tolerance: LEAF_TOLERANCE, highQuality: true });
  const out = writeBoundary(code, simplified.geometry, { osm: feature.properties.osm });
  console.log(`  ${code} (${config.name}): ${out.properties.areaKm2} km2`);
  return true;
}

/**
 * Union a province's resolved children and write the result.
 *
 * A province with a single child copies that child's geometry verbatim rather
 * than re-simplifying it at the coarser province tolerance: the two would then
 * disagree along the border, and every panorama in the gap would be assigned to
 * the province but to no district.
 * @param {string} code Province code.
 * @returns {number} Children that could not be included.
 */
// Unioning adjacent districts leaves hairline slivers wherever two boundaries
// were digitised from slightly different surveys. They are artifacts of the
// merge rather than geography, and some come out as rings of three points,
// which turf.simplify refuses to clean ("invalid polygon, fewer than 4
// points"). Anything under this area is one of those, so it is dropped before
// the outline is simplified. The smallest real part in the tree is two orders
// of magnitude larger.
const SLIVER_KM2 = 0.05;

/**
 * Drop sliver parts and rings left by a union.
 * @param {Object} feature Unioned polygon or multipolygon feature.
 * @returns {Object} Feature with only real parts left.
 */
function dropSlivers(feature) {
  const isMulti = feature.geometry.type === 'MultiPolygon';
  const polygons = isMulti ? feature.geometry.coordinates : [feature.geometry.coordinates];

  const kept = polygons
    // A hole has to enclose something real to be a hole; the union leaves
    // dozens of four-point ones along every shared border.
    .map((rings) => rings.filter((ring, index) => index === 0 || isReal(ring)))
    .filter((rings) => isReal(rings[0]));

  if (kept.length === 0) return feature;
  return kept.length === 1
    ? turf.polygon(kept[0], feature.properties)
    : turf.multiPolygon(kept, feature.properties);
}

/**
 * Whether a ring encloses more than a sliver.
 * @param {number[][]} ring Closed ring.
 * @returns {boolean} True when it is worth keeping.
 */
function isReal(ring) {
  return ring.length >= 4 && turf.area(turf.polygon([ring])) / 1e6 >= SLIVER_KM2;
}

function buildProvince(code) {
  const children = childrenOf(code);
  const resolved = children.filter((child) => existsSync(`${OUT_DIR}/${fileFor(child)}`));
  const missing = children.length - resolved.length;

  if (resolved.length === 0) {
    console.warn(`  ${code}: no children resolved, nothing to write`);
    return missing;
  }

  const features = resolved.map((child) =>
    JSON.parse(readFileSync(`${OUT_DIR}/${fileFor(child)}`, 'utf8'))
  );

  let geometry;
  if (features.length === 1) {
    geometry = features[0].geometry;
  } else {
    let merged = features[0];
    for (const feature of features.slice(1)) {
      merged = turf.union(turf.featureCollection([merged, feature]));
    }
    geometry = turf.simplify(dropSlivers(merged), {
      tolerance: LEAF_TOLERANCE,
      highQuality: true,
    }).geometry;
  }

  const out = writeBoundary(code, geometry, {
    parts: children.length,
    missingParts: missing,
  });
  console.log(
    `  ${code}: ${out.properties.areaKm2} km2 from ${resolved.length}/${children.length} children` +
      (missing ? `  (${missing} unresolved)` : '')
  );
  return missing;
}

/**
 * Rewrite the barrel that imports every boundary on disk.
 *
 * Generated from the directory rather than a declared list so a partial build
 * still compiles. Identifiers are sanitised and keys quoted because region
 * codes contain hyphens.
 * @returns {string[]} Region codes now in the barrel.
 */
function writeBoundaryBarrel() {
  const header =
    '// Generated by scripts/build-region-boundaries.mjs. Do not edit by hand.\n' +
    '//\n' +
    '// Lists only the boundaries that have actually been built, so a partial\n' +
    '// build still compiles.\n\n';
  return writeBarrelFile(`${OUT_DIR}/index.js`, header, 'REGION_BOUNDARIES', boundaryEntries(OUT_DIR));
}

/**
 * Write the region tree.
 *
 * Panorama counts deliberately live in a separate generated file written by
 * scripts/assign-pano-districts.mjs, so each generated file has exactly one
 * writer. src/lib/regions.js joins the two.
 * @param {Object} resolvedState Per-code resolution info.
 */
/**
 * The accented Vietnamese name of a node, for display.
 *
 * Leaves carry it inside their Nominatim query: "Quận Hoàn Kiếm, Hà Nội, Việt
 * Nam" names the place as "Hoàn Kiếm" once the administrative type is dropped.
 * The type stays when the rest is only a number ("Quận 7"), because that IS the
 * name. The country has none: it is "Vietnam" in an English interface.
 * @param {Object} config A REGION_CONFIG entry.
 * @returns {string|undefined}
 */
function vietnameseName(config) {
  if (config.nameVi) return config.nameVi;
  if (!config.query) return undefined;
  const head = config.query.split(',')[0].trim();
  const stripped = head.replace(/^(?:Quận|Huyện|Thị xã|Thành phố)\s+/u, '');
  return /^\d+$/.test(stripped) ? head : stripped;
}

function writeTree(resolvedState) {
  const nodes = Object.entries(REGION_CONFIG).map(([code, config]) => {
    const state = resolvedState[code] ?? {};
    const node = {
      code,
      name: config.name,
      parent: config.parent ?? null,
      level: config.level,
      children: childrenOf(code),
    };
    const nameVi = vietnameseName(config);
    if (nameVi) node.nameVi = nameVi;
    if (state.center) node.center = state.center;
    if (state.bbox) node.bbox = state.bbox;
    if (config.partialCoverage) node.partialCoverage = config.partialCoverage;
    if (state.coverage) node.coverage = state.coverage;
    if (state.missingParts) node.missingParts = state.missingParts;
    return node;
  });

  const body =
    '// Generated by scripts/build-region-boundaries.mjs. Do not edit by hand.\n' +
    '//\n' +
    '// The region tree: country > province > district. Safe to import from a\n' +
    '// client component -- it holds names and extents, never panorama data.\n' +
    '//\n' +
    '// A node marked coverage: \'unresolved\' has no boundary. That is recorded,\n' +
    '// not a build failure; see the Coverage note in docs/project-overview.md.\n\n' +
    'export const REGIONS = {\n' +
    nodes
      .map((node) => `  ${JSON.stringify(node.code)}: ${JSON.stringify(node)},`)
      .join('\n') +
    '\n};\n';

  mkdirSync(TREE_DIR, { recursive: true });
  writeFileSync(`${TREE_DIR}/index.js`, body);
}

// -- run ---------------------------------------------------------------------

const args = process.argv.slice(2);
// --regenerate rebuilds provinces, the barrel and the tree from the leaf
// polygons already on disk, without touching Nominatim. Use it after moving
// files or changing how the outputs are shaped; a full refetch is 60+ requests
// to a courtesy-rate-limited public service and should be reserved for actually
// refreshing the source data.
const regenerate = args.includes('--regenerate');
const only = args.filter((arg) => !arg.startsWith('--'));

const provinces = Object.keys(REGION_CONFIG).filter((code) => REGION_CONFIG[code].level === 'province');
const targets = only.length ? provinces.filter((code) => only.includes(code)) : provinces;

const resolvedState = {};
let unresolved = 0;

for (const province of targets) {
  console.log(`\n${province} — ${REGION_CONFIG[province].name}`);
  for (const leaf of childrenOf(province)) {
    const ok = regenerate
      ? existsSync(`${OUT_DIR}/${fileFor(leaf)}`)
      : await buildLeaf(leaf);
    if (!ok) {
      resolvedState[leaf] = { coverage: 'unresolved' };
      unresolved++;
    }
  }
  const missing = buildProvince(province);
  if (missing) resolvedState[province] = { missingParts: missing };
  // Rewritten after each province so an interrupted run leaves a consistent barrel.
  writeBoundaryBarrel();
}

// Read back what landed on disk, so the tree records the real extents rather
// than what the build hoped for.
for (const code of Object.keys(REGION_CONFIG)) {
  const relative = fileFor(code);
  if (!relative) continue;
  const path = `${OUT_DIR}/${relative}`;
  if (!existsSync(path)) continue;
  const { properties } = JSON.parse(readFileSync(path, 'utf8'));
  resolvedState[code] = {
    ...resolvedState[code],
    center: properties.center,
    bbox: properties.bbox,
  };
}

// The country has no polygon of its own: the real Vietnam outline is vastly
// larger than the covered area and would be misleading on a map. Its extent is
// the envelope of the provinces that actually resolved.
const provinceBoxes = provinces.map((code) => resolvedState[code]?.bbox).filter(Boolean);
if (provinceBoxes.length) {
  const bbox = [
    Math.min(...provinceBoxes.map((b) => b[0])),
    Math.min(...provinceBoxes.map((b) => b[1])),
    Math.max(...provinceBoxes.map((b) => b[2])),
    Math.max(...provinceBoxes.map((b) => b[3])),
  ].map((n) => Number(n.toFixed(5)));
  resolvedState.VN = {
    bbox,
    center: [
      Number(((bbox[1] + bbox[3]) / 2).toFixed(5)),
      Number(((bbox[0] + bbox[2]) / 2).toFixed(5)),
    ],
  };
}

const codes = writeBoundaryBarrel();
writeTree(resolvedState);

console.log(`\nbarrel: ${codes.length} boundaries`);
console.log(`tree:   ${Object.keys(REGION_CONFIG).length} nodes -> ${TREE_DIR}/index.js`);
if (unresolved) console.log(`unresolved leaves: ${unresolved} (recorded, not fatal)`);
console.log('done');
