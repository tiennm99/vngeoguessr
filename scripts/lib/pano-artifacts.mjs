// Structural validation of one panorama pipeline artifact, shared by
// scripts/seed-pano-db.mjs (the gate before anything is uploaded) and its
// tests. Every check here used to be a vitest assertion against the committed
// JSON index; once the JSON left the repo, seed time became the last moment
// these invariants can see the actual artifacts.

/**
 * Throw if an artifact is not fit to serve.
 *
 * Pure with respect to the filesystem and the region tree: the caller supplies
 * the expectations, so tests can feed synthetic artifacts without a tree.
 * @param {string} code Province code the artifact must describe.
 * @param {Object} index Parsed artifact JSON.
 * @param {number[]} bbox The province bbox from the region tree, [w,s,e,n].
 * @param {string[]} expectedDistricts The tree's mapped leaves for the province.
 */
export function validatePanoArtifact(code, index, bbox, expectedDistricts) {
  const fail = (why) => {
    throw new Error(`${code}: ${why}`);
  };

  if (index.code !== code) fail(`artifact says it is ${index.code}`);
  if (!Array.isArray(index.panos) || index.panos.length === 0) fail('no panoramas');

  // Well-formed rows, unique ids, inside the province bbox from the tree.
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const ids = new Set();
  for (const p of index.panos) {
    if (typeof p.id !== 'string' || p.id.length === 0) fail('malformed id');
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) fail(`bad coordinates on ${p.id}`);
    if (ids.has(p.id)) fail(`duplicate id ${p.id}`);
    ids.add(p.id);
    if (p.lat < minLat || p.lat > maxLat || p.lng < minLng || p.lng > maxLng) {
      fail(`${p.id} sits outside the province bbox`);
    }
    if (p.d !== undefined && !(p.d >= 0 && p.d < index.districts.length)) {
      fail(`${p.id} has an out-of-range district index`);
    }
  }

  // District partition: complete, nothing left unassigned, and the fallback
  // placements close enough to trust (see assign-pano-districts.mjs). The
  // schema tolerates NULL districts (province-only crediting), but the current
  // pipeline always assigns, so an unassigned point here means the assign step
  // was skipped, not that the data is legitimately province-only.
  const assigned = Object.values(index.districtCounts).reduce((a, b) => a + b, 0);
  if (assigned + index.unassigned !== index.panos.length) fail('district counts do not add up');
  if (index.unassigned !== 0) fail(`${index.unassigned} panoramas left unassigned`);
  if (index.stranded / index.panos.length >= 0.02) {
    fail(`${((index.stranded / index.panos.length) * 100).toFixed(2)}% stranded`);
  }
  if (index.worstStrandedKm >= 1.1) fail(`worst stranded placement ${index.worstStrandedKm}km`);

  // District codes must be exactly the tree's mapped leaves for this province.
  const got = [...index.districts].sort();
  if (JSON.stringify(got) !== JSON.stringify([...expectedDistricts].sort())) {
    fail(`districts do not match the region tree: ${got.join(',')}`);
  }
}
