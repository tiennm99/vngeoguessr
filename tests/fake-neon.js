// In-memory stand-in for @neondatabase/serverless, backed by PGlite -- real
// Postgres compiled to WASM, running in-process. Mocked in at the SDK boundary
// the same way fake-upstash-redis.js replaces @upstash/redis, so
// src/lib/pano-db.js and everything above it run unmodified under test.
//
// PGlite is real Postgres semantics, which is the point: the queries the app
// ships are exercised verbatim, not against a hand-written SQL interpreter.

import { PGlite } from '@electric-sql/pglite';

let db = null;

/** The PGlite instance behind the fake, for seeding fixtures directly. */
export function getFakeDb() {
  if (!db) db = new PGlite();
  return db;
}

/**
 * A `neon(url)`-compatible query function.
 *
 * Supports the two call shapes the driver exposes: `sql.query(text, params)`
 * (what pano-db.js uses) and the tagged-template form, both returning rows.
 * @returns {Function} The sql function.
 */
function fakeNeon() {
  const sql = async (strings, ...values) => {
    // Tagged template: interleave the string parts with $n placeholders.
    const text = strings.reduce(
      (acc, part, i) => acc + (i === 0 ? '' : `$${i}`) + part,
      ''
    );
    return (await getFakeDb().query(text, values)).rows;
  };
  sql.query = async (text, params) => (await getFakeDb().query(text, params ?? [])).rows;
  return sql;
}

/** Module shape handed to vi.mock for '@neondatabase/serverless'. */
export function fakeNeonModule() {
  return { neon: fakeNeon };
}
