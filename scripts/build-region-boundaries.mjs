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

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Nominatim asks for a real identifier and at most one request per second.
const USER_AGENT = 'vngeoguessr/1.0 (https://github.com/tiennm99/vngeoguessr)';
const REQUEST_GAP_MS = 1100;

// Leaves are simplified tightly: at district scale a loose tolerance opens gaps
// along shared borders, and scripts/assign-pano-districts.mjs has to decide
// which side of those borders every panorama falls on. Province outlines are
// only ever drawn at city zoom, so they stay coarse.
const LEAF_TOLERANCE = 0.0001; // ~11m
const PROVINCE_TOLERANCE = 0.0005; // ~55m

// The region tree. One entry per node.
//
//   level     'country' | 'province' | 'district'
//   query     Nominatim free-text lookup. Leaves only; a province is the union
//             of its children and the country has no polygon at all.
//   center    Optional override. The computed centre of mass of an irregular
//             outline can land somewhere no one associates with the place, so
//             the five original entry points keep their hand-picked centres.
//
// To add a province: add its node and its leaves here, run this script, then
// scripts/build-pano-index.mjs and scripts/assign-pano-districts.mjs. No
// application code changes -- every screen reads the generated tree. The
// Coverage section of docs/project-overview.md explains what each kind of
// absent coverage means and which one is actually a defect.
const REGIONS = {
  VN: { name: 'Vietnam', level: 'country' },

  // -- Ha Noi ---------------------------------------------------------------
  // Not merged in 2025, but split here into its 30 pre-2025 units.
  HN: { name: 'Ha Noi', level: 'province', parent: 'VN', center: [21.0285, 105.8542], legacyBbox: [105.28896, 20.56452, 106.02004, 21.38542] },
  'HN-BADINH': { name: 'Ba Dinh', level: 'district', parent: 'HN', query: 'Quận Ba Đình, Hà Nội, Việt Nam' },
  'HN-HOANKIEM': { name: 'Hoan Kiem', level: 'district', parent: 'HN', query: 'Quận Hoàn Kiếm, Hà Nội, Việt Nam' },
  'HN-TAYHO': { name: 'Tay Ho', level: 'district', parent: 'HN', query: 'Quận Tây Hồ, Hà Nội, Việt Nam' },
  'HN-LONGBIEN': { name: 'Long Bien', level: 'district', parent: 'HN', query: 'Quận Long Biên, Hà Nội, Việt Nam' },
  'HN-CAUGIAY': { name: 'Cau Giay', level: 'district', parent: 'HN', query: 'Quận Cầu Giấy, Hà Nội, Việt Nam' },
  'HN-DONGDA': { name: 'Dong Da', level: 'district', parent: 'HN', query: 'Quận Đống Đa, Hà Nội, Việt Nam' },
  'HN-HAIBATRUNG': { name: 'Hai Ba Trung', level: 'district', parent: 'HN', query: 'Quận Hai Bà Trưng, Hà Nội, Việt Nam' },
  'HN-HOANGMAI': { name: 'Hoang Mai', level: 'district', parent: 'HN', query: 'Quận Hoàng Mai, Hà Nội, Việt Nam' },
  'HN-THANHXUAN': { name: 'Thanh Xuan', level: 'district', parent: 'HN', query: 'Quận Thanh Xuân, Hà Nội, Việt Nam' },
  'HN-BACTULIEM': { name: 'Bac Tu Liem', level: 'district', parent: 'HN', query: 'Quận Bắc Từ Liêm, Hà Nội, Việt Nam' },
  'HN-NAMTULIEM': { name: 'Nam Tu Liem', level: 'district', parent: 'HN', query: 'Quận Nam Từ Liêm, Hà Nội, Việt Nam' },
  'HN-HADONG': { name: 'Ha Dong', level: 'district', parent: 'HN', query: 'Quận Hà Đông, Hà Nội, Việt Nam' },
  'HN-SONTAY': { name: 'Son Tay', level: 'district', parent: 'HN', query: 'Thị xã Sơn Tây, Hà Nội, Việt Nam' },
  'HN-BAVI': { name: 'Ba Vi', level: 'district', parent: 'HN', query: 'Huyện Ba Vì, Hà Nội, Việt Nam' },
  'HN-CHUONGMY': { name: 'Chuong My', level: 'district', parent: 'HN', query: 'Huyện Chương Mỹ, Hà Nội, Việt Nam' },
  'HN-DANPHUONG': { name: 'Dan Phuong', level: 'district', parent: 'HN', query: 'Huyện Đan Phượng, Hà Nội, Việt Nam' },
  'HN-DONGANH': { name: 'Dong Anh', level: 'district', parent: 'HN', query: 'Huyện Đông Anh, Hà Nội, Việt Nam' },
  'HN-GIALAM': { name: 'Gia Lam', level: 'district', parent: 'HN', query: 'Huyện Gia Lâm, Hà Nội, Việt Nam' },
  'HN-HOAIDUC': { name: 'Hoai Duc', level: 'district', parent: 'HN', query: 'Huyện Hoài Đức, Hà Nội, Việt Nam' },
  'HN-MELINH': { name: 'Me Linh', level: 'district', parent: 'HN', query: 'Huyện Mê Linh, Hà Nội, Việt Nam' },
  'HN-MYDUC': { name: 'My Duc', level: 'district', parent: 'HN', query: 'Huyện Mỹ Đức, Hà Nội, Việt Nam' },
  'HN-PHUXUYEN': { name: 'Phu Xuyen', level: 'district', parent: 'HN', query: 'Huyện Phú Xuyên, Hà Nội, Việt Nam' },
  'HN-PHUCTHO': { name: 'Phuc Tho', level: 'district', parent: 'HN', query: 'Huyện Phúc Thọ, Hà Nội, Việt Nam' },
  'HN-QUOCOAI': { name: 'Quoc Oai', level: 'district', parent: 'HN', query: 'Huyện Quốc Oai, Hà Nội, Việt Nam' },
  'HN-SOCSON': { name: 'Soc Son', level: 'district', parent: 'HN', query: 'Huyện Sóc Sơn, Hà Nội, Việt Nam' },
  'HN-THACHTHAT': { name: 'Thach That', level: 'district', parent: 'HN', query: 'Huyện Thạch Thất, Hà Nội, Việt Nam' },
  'HN-THANHOAI': { name: 'Thanh Oai', level: 'district', parent: 'HN', query: 'Huyện Thanh Oai, Hà Nội, Việt Nam' },
  'HN-THANHTRI': { name: 'Thanh Tri', level: 'district', parent: 'HN', query: 'Huyện Thanh Trì, Hà Nội, Việt Nam' },
  'HN-THUONGTIN': { name: 'Thuong Tin', level: 'district', parent: 'HN', query: 'Huyện Thường Tín, Hà Nội, Việt Nam' },
  'HN-UNGHOA': { name: 'Ung Hoa', level: 'district', parent: 'HN', query: 'Huyện Ứng Hòa, Hà Nội, Việt Nam' },

  // -- Ho Chi Minh ----------------------------------------------------------
  // Districts 2 and 9 are absent on purpose: both merged into Thu Duc in 2021.
  TPHCM: { name: 'Ho Chi Minh', level: 'province', parent: 'VN', center: [10.8231, 106.6297], legacyBbox: [106.46356, 10.35828, 107.02758, 10.92934] },
  'TPHCM-Q1': { name: 'District 1', level: 'district', parent: 'TPHCM', query: 'Quận 1, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q3': { name: 'District 3', level: 'district', parent: 'TPHCM', query: 'Quận 3, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q4': { name: 'District 4', level: 'district', parent: 'TPHCM', query: 'Quận 4, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q5': { name: 'District 5', level: 'district', parent: 'TPHCM', query: 'Quận 5, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q6': { name: 'District 6', level: 'district', parent: 'TPHCM', query: 'Quận 6, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q7': { name: 'District 7', level: 'district', parent: 'TPHCM', query: 'Quận 7, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q8': { name: 'District 8', level: 'district', parent: 'TPHCM', query: 'Quận 8, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q10': { name: 'District 10', level: 'district', parent: 'TPHCM', query: 'Quận 10, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q11': { name: 'District 11', level: 'district', parent: 'TPHCM', query: 'Quận 11, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-Q12': { name: 'District 12', level: 'district', parent: 'TPHCM', query: 'Quận 12, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-BINHTAN': { name: 'Binh Tan', level: 'district', parent: 'TPHCM', query: 'Quận Bình Tân, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-BINHTHANH': { name: 'Binh Thanh', level: 'district', parent: 'TPHCM', query: 'Quận Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-GOVAP': { name: 'Go Vap', level: 'district', parent: 'TPHCM', query: 'Quận Gò Vấp, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-PHUNHUAN': { name: 'Phu Nhuan', level: 'district', parent: 'TPHCM', query: 'Quận Phú Nhuận, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-TANBINH': { name: 'Tan Binh', level: 'district', parent: 'TPHCM', query: 'Quận Tân Bình, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-TANPHU': { name: 'Tan Phu', level: 'district', parent: 'TPHCM', query: 'Quận Tân Phú, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-THUDUC': { name: 'Thu Duc', level: 'district', parent: 'TPHCM', query: 'Thành phố Thủ Đức, Việt Nam' },
  'TPHCM-BINHCHANH': { name: 'Binh Chanh', level: 'district', parent: 'TPHCM', query: 'Huyện Bình Chánh, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-CANGIO': { name: 'Can Gio', level: 'district', parent: 'TPHCM', query: 'Huyện Cần Giờ, Thành phố Hồ Chí Minh, Việt Nam' },
  // Cu Chi did not resolve for the pre-tree build either, which is why the old
  // tphcm.json carried "missingParts": 1 and no panorama in the index sits in
  // Cu Chi. Kept here so the gap stays visible rather than silently dropped.
  'TPHCM-CUCHI': { name: 'Cu Chi', level: 'district', parent: 'TPHCM', query: 'Huyện Củ Chi, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-HOCMON': { name: 'Hoc Mon', level: 'district', parent: 'TPHCM', query: 'Huyện Hóc Môn, Thành phố Hồ Chí Minh, Việt Nam' },
  'TPHCM-NHABE': { name: 'Nha Be', level: 'district', parent: 'TPHCM', query: 'Huyện Nhà Bè, Thành phố Hồ Chí Minh, Việt Nam' },

  // -- Da Nang --------------------------------------------------------------
  // Hoang Sa is administratively part of Da Nang but is a disputed offshore
  // island group with no street imagery, so it is deliberately left out.
  DN: { name: 'Da Nang', level: 'province', parent: 'VN', center: [16.0544, 108.2022], legacyBbox: [107.81854, 15.91799, 108.33864, 16.2255] },
  'DN-HAICHAU': { name: 'Hai Chau', level: 'district', parent: 'DN', query: 'Quận Hải Châu, Đà Nẵng, Việt Nam' },
  'DN-THANHKHE': { name: 'Thanh Khe', level: 'district', parent: 'DN', query: 'Quận Thanh Khê, Đà Nẵng, Việt Nam' },
  'DN-SONTRA': { name: 'Son Tra', level: 'district', parent: 'DN', query: 'Quận Sơn Trà, Đà Nẵng, Việt Nam' },
  'DN-NGUHANHSON': { name: 'Ngu Hanh Son', level: 'district', parent: 'DN', query: 'Quận Ngũ Hành Sơn, Đà Nẵng, Việt Nam' },
  'DN-LIENCHIEU': { name: 'Lien Chieu', level: 'district', parent: 'DN', query: 'Quận Liên Chiểu, Đà Nẵng, Việt Nam' },
  'DN-CAMLE': { name: 'Cam Le', level: 'district', parent: 'DN', query: 'Quận Cẩm Lệ, Đà Nẵng, Việt Nam' },
  'DN-HOAVANG': { name: 'Hoa Vang', level: 'district', parent: 'DN', query: 'Huyện Hòa Vang, Đà Nẵng, Việt Nam' },

  // -- Lam Dong / Long An ---------------------------------------------------
  // One town each. The leaf codes stay bare because their leaderboard keys
  // already exist under those names.
  LD: { name: 'Lam Dong', level: 'province', parent: 'VN', partialCoverage: 'one town covered', legacyBbox: [108.31521, 11.80798, 108.5944, 12.00855] },
  DL: { name: 'Da Lat', level: 'district', parent: 'LD', query: 'Thành phố Đà Lạt, Việt Nam', center: [11.9404, 108.4583] },

  LA: { name: 'Long An', level: 'province', parent: 'VN', partialCoverage: 'one town covered', legacyBbox: [106.27082, 10.7409, 106.53287, 11.02578] },
  DH: { name: 'Duc Hoa', level: 'district', parent: 'LA', query: 'Đức Hòa, Việt Nam', center: [10.8888, 106.3825] },
};

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
  const config = REGIONS[code];
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
  return Object.keys(REGIONS).filter((key) => REGIONS[key].parent === code);
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
  const config = REGIONS[code];
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
  const config = REGIONS[code];
  const box = REGIONS[config.parent]?.legacyBbox;

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
    geometry = turf.simplify(merged, {
      tolerance: PROVINCE_TOLERANCE,
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
function writeTree(resolvedState) {
  const nodes = Object.entries(REGIONS).map(([code, config]) => {
    const state = resolvedState[code] ?? {};
    const node = {
      code,
      name: config.name,
      parent: config.parent ?? null,
      level: config.level,
      children: childrenOf(code),
    };
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

const provinces = Object.keys(REGIONS).filter((code) => REGIONS[code].level === 'province');
const targets = only.length ? provinces.filter((code) => only.includes(code)) : provinces;

const resolvedState = {};
let unresolved = 0;

for (const province of targets) {
  console.log(`\n${province} — ${REGIONS[province].name}`);
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
for (const code of Object.keys(REGIONS)) {
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
console.log(`tree:   ${Object.keys(REGIONS).length} nodes -> ${TREE_DIR}/index.js`);
if (unresolved) console.log(`unresolved leaves: ${unresolved} (recorded, not fatal)`);
console.log('done');
