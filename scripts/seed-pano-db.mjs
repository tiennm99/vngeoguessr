// Seed the panorama index into Postgres (Neon) from the local pipeline
// artifacts in data-build/panos/.
//
// Usage:
//   node scripts/seed-pano-db.mjs                 # validate + seed every province
//   node scripts/seed-pano-db.mjs --province=DN   # reseed one province in place
//   node scripts/seed-pano-db.mjs --check         # validate artifacts only, no DB
//
// Needs DATABASE_URL (or POSTGRES_URL) in .env or the environment. Costs no
// Mapillary requests -- it only uploads what build-pano-index.mjs and
// assign-pano-districts.mjs already wrote.
//
// The full run builds `panoramas_next`, verifies it row-for-row against the
// artifacts, then renames it into place -- readers never see a half-loaded
// table. The previous generation survives as `panoramas_old` until the next
// full run. `--province` edits the live table instead: a few seconds where that
// one province is partially loaded, acceptable for an incremental refresh.
//
// The data-quality gate below is the old tests/pano-index.test.js real-data
// suite, moved here: once the JSON left the repo, seed time became the last
// moment those invariants can see the actual artifacts.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { REGIONS } from '../src/data/regions/index.js';
import { REGION_COUNTS } from '../src/data/regions/counts.js';
import { PANO_DIR } from './lib/paths.mjs';
import { panoramasDdl, PANO_PROVINCES_DDL } from './lib/pano-schema.mjs';
import { validatePanoArtifact } from './lib/pano-artifacts.mjs';

const BATCH_SIZE = 5000;

/** Read .env the way the other scripts do, without pulling in a dependency. */
function loadEnvFile() {
  if (!existsSync('.env')) return {};
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=');
        // `vercel env pull` quotes its values; the raw URL is what dials.
        return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"(.*)"$/, '$1')];
      })
  );
}

function databaseUrl() {
  const env = loadEnvFile();
  const url =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? env.DATABASE_URL ?? env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL or POSTGRES_URL missing from .env and the environment');
  return url;
}

const PROVINCES = Object.keys(REGIONS).filter((code) => REGIONS[code].level === 'province');

/**
 * Load one province artifact and run the data-quality gate on it. Failing any
 * check means the pipeline output is not fit to serve, so the script refuses
 * rather than uploading it. Structural checks live in
 * scripts/lib/pano-artifacts.mjs, where the tests exercise them.
 * @param {string} code Province code.
 * @returns {Object} The parsed index.
 */
function loadArtifact(code) {
  const path = `${PANO_DIR}/${code.toLowerCase()}.json`;
  if (!existsSync(path)) {
    throw new Error(`${path} not found. Run: node scripts/build-pano-index.mjs ${code}`);
  }
  const index = JSON.parse(readFileSync(path, 'utf8'));

  const expectedDistricts = (REGIONS[code].children ?? []).filter((leaf) => REGIONS[leaf].bbox);
  validatePanoArtifact(code, index, REGIONS[code].bbox, expectedDistricts);

  // The committed counts.js is what the client trusts for playability; a
  // mismatch means the artifacts moved after the last assign run.
  const counted = REGION_COUNTS[code]?.panos;
  if (counted !== index.panos.length) {
    throw new Error(
      `${code}: counts.js says ${counted} panoramas, artifact holds ${index.panos.length}. ` +
        'Re-run: node scripts/assign-pano-districts.mjs'
    );
  }

  return index;
}

/** Insert one province's rows into a table in unnest batches. */
async function insertProvince(sql, table, code, index) {
  for (let start = 0; start < index.panos.length; start += BATCH_SIZE) {
    const batch = index.panos.slice(start, start + BATCH_SIZE);
    await sql.query(
      `INSERT INTO ${table} (id, province, district, lat, lng)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[])`,
      [
        batch.map((p) => p.id),
        batch.map(() => code),
        batch.map((p) => (p.d === undefined ? null : index.districts[p.d])),
        batch.map((p) => p.lat),
        batch.map((p) => p.lng),
      ]
    );
  }
}

/** Assert the table holds exactly the artifact's rows for one province. */
async function verifyProvince(sql, table, code, index) {
  const rows = await sql.query(
    `SELECT count(*)::int AS n, count(district)::int AS assigned FROM ${table} WHERE province = $1`,
    [code]
  );
  if (rows[0].n !== index.panos.length) {
    throw new Error(`${code}: uploaded ${rows[0].n} rows, artifact holds ${index.panos.length}`);
  }
  if (rows[0].assigned !== index.panos.length - index.unassigned) {
    throw new Error(`${code}: district assignment count drifted during upload`);
  }
}

/** Upsert the per-province metadata row. */
async function recordProvince(sql, code, index) {
  await sql.query(
    `INSERT INTO pano_provinces (code, count, generated_at, assigned_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (code) DO UPDATE SET count = $2, generated_at = $3, assigned_at = $4`,
    [code, index.panos.length, index.generatedAt ?? null, index.assignedAt ?? null]
  );
}

/**
 * Rename a table's known indexes from one prefix to another.
 *
 * Load-bearing, not cosmetic: a later --province run re-issues
 * `CREATE INDEX IF NOT EXISTS panoramas_*` and would silently build duplicate
 * indexes if the live table's indexes still carried their staging names.
 */
async function renameIndexes(sql, from, to) {
  for (const suffix of ['pkey', 'province_id_idx', 'district_id_idx']) {
    await sql.query(`ALTER INDEX IF EXISTS ${from}_${suffix} RENAME TO ${to}_${suffix}`, []);
  }
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const provinceArg = args.find((a) => a.startsWith('--province='))?.split('=')[1];
const unknownArgs = args.filter((a) => a !== '--check' && !a.startsWith('--province='));
if (unknownArgs.length > 0) throw new Error(`Unknown arguments: ${unknownArgs.join(' ')}`);
if (provinceArg && !PROVINCES.includes(provinceArg)) {
  throw new Error(`Not a province: ${provinceArg}. Provinces: ${PROVINCES.join(', ')}`);
}

// Guard against a stale artifact resurrecting a province that no longer
// exists. Da Lat and Duc Hoa were promoted into Lam Dong and Long An; an old
// dl.json left beside ld.json would silently double-count ~12k panoramas.
if (existsSync(PANO_DIR)) {
  const known = new Set(PROVINCES.map((code) => `${code.toLowerCase()}.json`));
  const strays = readdirSync(PANO_DIR)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => !known.has(name));
  if (strays.length > 0) {
    throw new Error(`${PANO_DIR} holds non-province artifacts: ${strays.join(', ')}. Delete them.`);
  }
}

const codes = provinceArg ? [provinceArg] : PROVINCES;
const artifacts = new Map();
for (const code of codes) {
  artifacts.set(code, loadArtifact(code));
  console.log(`validated ${code}: ${artifacts.get(code).panos.length} panoramas`);
}

if (checkOnly) {
  console.log('--check: artifacts are fit to seed, nothing uploaded');
  process.exit(0);
}

const sql = neon(databaseUrl());
for (const statement of PANO_PROVINCES_DDL) await sql.query(statement, []);

if (provinceArg) {
  // In-place refresh of one province. Brief window where the province is
  // partially loaded; the other provinces are untouched throughout.
  const index = artifacts.get(provinceArg);
  for (const statement of panoramasDdl('panoramas')) await sql.query(statement, []);
  await sql.query('DELETE FROM panoramas WHERE province = $1', [provinceArg]);
  await insertProvince(sql, 'panoramas', provinceArg, index);
  await verifyProvince(sql, 'panoramas', provinceArg, index);
  await recordProvince(sql, provinceArg, index);
  console.log(`reseeded ${provinceArg} in place`);
} else {
  // Full load into a staging table, verified, then renamed into place.
  await sql.query('DROP TABLE IF EXISTS panoramas_next', []);
  // The previous backup makes way for the current live table to become the
  // backup. Two generations back is gone from here on.
  await sql.query('DROP TABLE IF EXISTS panoramas_old', []);
  for (const statement of panoramasDdl('panoramas_next')) await sql.query(statement, []);

  for (const [code, index] of artifacts) {
    await insertProvince(sql, 'panoramas_next', code, index);
    await verifyProvince(sql, 'panoramas_next', code, index);
    console.log(`uploaded ${code}`);
  }

  // Both table renames in ONE transaction: the HTTP driver runs each plain
  // query in its own implicit transaction, and doing these as two calls left a
  // window with no `panoramas` relation at all. Index renames can trail -- a
  // reader never names an index.
  await sql.transaction([
    sql.query('ALTER TABLE IF EXISTS panoramas RENAME TO panoramas_old'),
    sql.query('ALTER TABLE panoramas_next RENAME TO panoramas'),
  ]);
  await renameIndexes(sql, 'panoramas', 'panoramas_old');
  await renameIndexes(sql, 'panoramas_next', 'panoramas');
  for (const [code, index] of artifacts) await recordProvince(sql, code, index);
  console.log('swapped panoramas into place; previous generation kept as panoramas_old');
}

const totals = await sql.query('SELECT count(*)::int AS n FROM panoramas', []);
console.log(`done: panoramas now holds ${totals[0].n} rows`);
