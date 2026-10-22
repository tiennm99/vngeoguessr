// The panorama tables, shared by scripts/seed-pano-db.mjs (against Neon) and
// tests/pano-fixtures.js (against the in-memory Postgres fake). One copy so the
// tables the tests exercise cannot drift from the ones production queries.
//
// `district` is NULL for a panorama that fell outside every district polygon
// and belongs to the province only -- the same meaning `d: undefined` had in
// the old JSON index.
//
// Every table lives in a named schema (PG_SCHEMA, resolved by
// src/lib/pg-schema.js), never `public`, so a shared database's other tenants
// cannot collide with the tables the seed drops and renames.

/**
 * DDL for a panoramas table under any name.
 *
 * Parameterised by name because the seed script builds `panoramas_next` and
 * swaps it in, and index names are schema-unique so each table needs its own.
 * The index names stay unqualified: Postgres always creates an index in its
 * table's schema.
 * @param {string} schema Validated schema name, e.g. 'vngeoguessr'.
 * @param {string} table Table name, e.g. 'panoramas' or 'panoramas_next'.
 * @returns {string[]} Statements to run in order.
 */
export function panoramasDdl(schema, table) {
  return [
    `CREATE TABLE IF NOT EXISTS ${schema}.${table} (
      id       text PRIMARY KEY,
      province text NOT NULL,
      district text,
      lat      double precision NOT NULL,
      lng      double precision NOT NULL
    )`,
    // Composite with id: the draw query is WHERE <region> ORDER BY id OFFSET n
    // LIMIT 1, and (province, id) turns that OFFSET into an index-only skip
    // instead of sorting the whole partition (225,966 rows for Ha Noi).
    `CREATE INDEX IF NOT EXISTS ${table}_province_id_idx ON ${schema}.${table} (province, id)`,
    `CREATE INDEX IF NOT EXISTS ${table}_district_id_idx ON ${schema}.${table} (district, id)`,
  ];
}

/**
 * DDL for the per-province metadata table.
 * @param {string} schema Validated schema name.
 * @returns {string[]} Statements to run in order.
 */
export function panoProvincesDdl(schema) {
  return [
    `CREATE TABLE IF NOT EXISTS ${schema}.pano_provinces (
      code         text PRIMARY KEY,
      count        integer NOT NULL,
      generated_at timestamptz,
      assigned_at  timestamptz
    )`,
  ];
}
