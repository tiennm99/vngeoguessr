// Read a leaderboard backup and write it back to Redis.
//
// The backup is what scripts/export-leaderboards.mjs writes: every score and
// distance board under its logical key, each as a list of { member, score }.
// Logical keys carry no prefix, so a file restores under whatever KEY_PREFIX
// the target deployment uses.

import { del, zAddMany } from '../../src/lib/upstash.js';

// Only the two kinds of board the export writes. Anything else in the file is
// refused rather than written, so a hand-edited or foreign JSON cannot create
// sessions, histories or other keys in a shared database. The suffix is left
// open: older region codes may still have boards worth restoring.
const BOARD_KEY = /^(leaderboard|distance):\S+$/;
// Members per ZADD: one command per chunk keeps a large board well under the
// REST API's request size.
const CHUNK = 1000;

/**
 * Parse and validate a backup file's text.
 * @param {string} text Decrypted JSON written by export-leaderboards.mjs.
 * @returns {{ exportedAt: string|null, prefix: string|null, boards: Object<string, Array<{member: string, score: number}>> }}
 * @throws {Error} When the file is not a leaderboard backup.
 */
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (!data || typeof data.boards !== 'object' || data.boards === null || Array.isArray(data.boards)) {
    throw new Error('Not a leaderboard backup: no "boards" object');
  }
  for (const [key, entries] of Object.entries(data.boards)) {
    if (!BOARD_KEY.test(key)) throw new Error(`Refusing unexpected key "${key}"`);
    if (!Array.isArray(entries)) throw new Error(`Board "${key}" is not a list`);
    for (const entry of entries) {
      if (typeof entry?.member !== 'string' || entry.member === '' || !Number.isFinite(entry.score)) {
        throw new Error(`Board "${key}" has an invalid entry: ${JSON.stringify(entry)}`);
      }
    }
  }
  return {
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
    prefix: typeof data.prefix === 'string' ? data.prefix : null,
    boards: data.boards,
  };
}

/**
 * Write every board in a backup to Redis.
 *
 * Merge (the default) sets each backed-up member's score and leaves members
 * the backup does not know about alone. Replace deletes each board first, so
 * it ends up exactly as the backup holds it. Boards absent from the backup are
 * never touched in either mode.
 * @param {{ client: import('@upstash/redis').Redis, prefix: string }} h
 * @param {Object<string, Array<{member: string, score: number}>>} boards From parseBackup.
 * @param {boolean} replace Delete each board before writing it.
 * @returns {Promise<{ boards: number, members: number }>}
 */
export async function restoreBoards(h, boards, replace) {
  let members = 0;
  const keys = Object.keys(boards);
  for (const key of keys) {
    const entries = boards[key];
    if (replace) await del(h, key);
    for (let at = 0; at < entries.length; at += CHUNK) {
      const chunk = entries.slice(at, at + CHUNK).map(({ member, score }) => ({ member, score }));
      await zAddMany(h, key, chunk);
    }
    members += entries.length;
  }
  return { boards: keys.length, members };
}
