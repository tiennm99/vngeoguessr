// Synthetic panorama rows for the PGlite fake, using real region codes so
// src/lib/regions.js resolves them. Small on purpose: these tests pin the
// query behavior of pano-index.js, not the quality of the real data -- that
// moved into scripts/seed-pano-db.mjs, which sees the actual artifacts.
//
// All five playable provinces get rows so a country draw always lands
// somewhere. Every pano is district-assigned; tests that need a
// province-only pano (district NULL) pass includeUnassigned=true, kept out of
// the default set so route tests asserting district-level resolution cannot
// flake by drawing it.

import { getFakeDb } from './fake-neon.js';
import { panoramasDdl, PANO_PROVINCES_DDL } from '../scripts/lib/pano-schema.mjs';

export const GENERATED_AT = '2026-08-30T04:25:42.000Z';

// id, province, district, lat, lng. Coordinates are spread along latitude so
// bbox and sampling assertions can slice them predictably.
export const FIXTURE_PANOS = [
  ['ld-1', 'LD', 'DL', 11.9, 108.4],
  ['ld-2', 'LD', 'DL', 11.91, 108.41],
  ['ld-3', 'LD', 'DL', 11.92, 108.42],
  ['ld-4', 'LD', 'DL', 11.93, 108.43],
  ['ld-5', 'LD', 'DL', 11.94, 108.44],
  ['dn-hc-1', 'DN', 'DN-HAICHAU', 16.05, 108.21],
  ['dn-hc-2', 'DN', 'DN-HAICHAU', 16.06, 108.22],
  ['dn-hc-3', 'DN', 'DN-HAICHAU', 16.07, 108.22],
  ['dn-hc-4', 'DN', 'DN-HAICHAU', 16.08, 108.23],
  ['dn-st-1', 'DN', 'DN-SONTRA', 16.09, 108.26],
  ['dn-st-2', 'DN', 'DN-SONTRA', 16.1, 108.27],
  ['dn-st-3', 'DN', 'DN-SONTRA', 16.11, 108.28],
  ['hcm-q1-1', 'TPHCM', 'TPHCM-Q1', 10.77, 106.7],
  ['hcm-q1-2', 'TPHCM', 'TPHCM-Q1', 10.78, 106.7],
  ['hcm-q1-3', 'TPHCM', 'TPHCM-Q1', 10.79, 106.71],
  ['hcm-q7-1', 'TPHCM', 'TPHCM-Q7', 10.73, 106.72],
  ['hcm-q7-2', 'TPHCM', 'TPHCM-Q7', 10.74, 106.73],
  ['hcm-q7-3', 'TPHCM', 'TPHCM-Q7', 10.75, 106.73],
  ['hn-bd-1', 'HN', 'HN-BADINH', 21.03, 105.81],
  ['hn-bd-2', 'HN', 'HN-BADINH', 21.04, 105.82],
  ['hn-bd-3', 'HN', 'HN-BADINH', 21.05, 105.83],
  ['la-dh-1', 'LA', 'DH', 10.88, 106.4],
  ['la-dh-2', 'LA', 'DH', 10.89, 106.41],
  ['la-dh-3', 'LA', 'DH', 10.9, 106.42],
];

// A panorama outside every district polygon: creditable to DN only.
export const UNASSIGNED_PANO = ['dn-loose-1', 'DN', null, 16.2, 108.3];

/**
 * Create the tables and load the fixture set into the PGlite fake.
 *
 * Seed once per test file, before any query: pano-index.js caches counts for
 * the life of the process, so rows added after a count was read stay
 * invisible to it.
 * @param {boolean} includeUnassigned Also insert the district-NULL panorama.
 */
export async function seedPanoFixtures(includeUnassigned) {
  const db = getFakeDb();
  for (const statement of panoramasDdl('panoramas')) await db.query(statement);
  for (const statement of PANO_PROVINCES_DDL) await db.query(statement);

  const rows = includeUnassigned ? [...FIXTURE_PANOS, UNASSIGNED_PANO] : FIXTURE_PANOS;
  for (const [id, province, district, lat, lng] of rows) {
    await db.query(
      `INSERT INTO panoramas (id, province, district, lat, lng)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [id, province, district, lat, lng]
    );
  }

  const perProvince = new Map();
  for (const [, province] of rows) {
    perProvince.set(province, (perProvince.get(province) ?? 0) + 1);
  }
  for (const [code, count] of perProvince) {
    await db.query(
      `INSERT INTO pano_provinces (code, count, generated_at, assigned_at)
       VALUES ($1, $2, $3, $3) ON CONFLICT (code) DO UPDATE SET count = $2`,
      [code, count, GENERATED_AT]
    );
  }
}

/** Fixture ids for one region code, province or district. */
export function fixtureIds(code) {
  return FIXTURE_PANOS.filter(([, province, district]) => province === code || district === code).map(
    ([id]) => id
  );
}
