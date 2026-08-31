// The panorama tables, shared by scripts/seed-pano-db.mjs (against Neon) and
// tests/pano-fixtures.js (against the in-memory Postgres fake). One copy so the
// tables the tests exercise cannot drift from the ones production queries.
//
// `district` is NULL for a panorama that fell outside every district polygon
// and belongs to the province only -- the same meaning `d: undefined` had in
// the old JSON index.

/**
 * DDL for a panoramas table under any name.
 *
 * Parameterised by name because the seed script builds `panoramas_next` and
 * swaps it in, and index names are schema-unique so each table needs its own.
 * @param {string} table Table name, e.g. 'panoramas' or 'panoramas_next'.
 * @returns {string[]} Statements to run in order.
 */
export function panoramasDdl(table) {
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (
      id       text PRIMARY KEY,
      province text NOT NULL,
      district text,
      lat      double precision NOT NULL,
      lng      double precision NOT NULL
    )`,
    // Composite with id: the draw query is WHERE <region> ORDER BY id OFFSET n
    // LIMIT 1, and (province, id) turns that OFFSET into an index-only skip
    // instead of sorting the whole partition (225,966 rows for Ha Noi).
    `CREATE INDEX IF NOT EXISTS ${table}_province_id_idx ON ${table} (province, id)`,
    `CREATE INDEX IF NOT EXISTS ${table}_district_id_idx ON ${table} (district, id)`,
  ];
}

/** DDL for the per-province metadata table. */
export const PANO_PROVINCES_DDL = [
  `CREATE TABLE IF NOT EXISTS pano_provinces (
    code         text PRIMARY KEY,
    count        integer NOT NULL,
    generated_at timestamptz,
    assigned_at  timestamptz
  )`,
];
