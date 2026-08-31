import { neon } from '@neondatabase/serverless';

// Neon Postgres adapter (HTTP driver).
//
// Holds the panorama index: table `panoramas` (id, province, district, lat,
// lng) and `pano_provinces` (per-province metadata). Seeded offline by
// scripts/seed-pano-db.mjs from the pipeline artifacts; the app only reads.
//
// SERVER-SIDE ONLY. The rows are exact round answers, same as the old JSON
// index -- tests/regions.test.js keeps this module off every client import
// path.
//
// The HTTP driver opens no sockets and keeps no pool, so one handle per
// process is safe in serverless the same way the Upstash REST client is.

let handle = null;

/**
 * Get the global Neon handle (singleton).
 * Accepts DATABASE_URL (Neon's own name) or POSTGRES_URL (the alias the Vercel
 * Marketplace integration also injects).
 * @returns {{ sql: Function }}
 */
export function getPanoDb() {
  if (handle) return handle;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL or POSTGRES_URL is required');
  handle = { sql: neon(url) };
  return handle;
}

/**
 * Run one parameterised query and return its rows.
 * @param {{ sql: Function }} h Neon handle.
 * @param {string} text SQL with $1-style placeholders.
 * @param {Array} params Parameter values.
 * @returns {Promise<Object[]>} Rows.
 */
export async function query(h, text, params) {
  return await h.sql.query(text, params ?? []);
}
