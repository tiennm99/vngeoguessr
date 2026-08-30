// Backfill logic for the leaderboard migration.
//
// Separated from the CLI in scripts/migrate-leaderboards.mjs so every guard is
// callable from a test. This is the one place in the region-tree change where
// existing player points can be destroyed, and a script whose safety checks are
// only reachable by running it against a live database is not testable at all.

import {
  scanKeys,
  zAdd,
  zRangeWithScores,
  zRemRangeByRank,
} from '../../src/lib/upstash.js';
import { leaderboardKeys } from '../../src/lib/leaderboard.js';

// child -> parent. Lam Dong and Long An are new nodes whose only child already
// holds the full history.
export const BACKFILLS = [
  { from: 'DL', to: 'LD', label: 'Da Lat -> Lam Dong' },
  { from: 'DH', to: 'LA', label: 'Duc Hoa -> Long An' },
];

export const PATTERNS = ['leaderboard:*', 'distance:*'];

/**
 * Every key each backfill pair touches, score and distance.
 *
 * Built through the same key functions the app uses, so a change to key naming
 * cannot leave the migration writing to the old names.
 * @returns {Array<{fromKey: string, toKey: string, label: string}>} Pairs.
 */
export function backfillPairs() {
  return BACKFILLS.flatMap(({ from, to, label }) => [
    { fromKey: leaderboardKeys.score(from), toKey: leaderboardKeys.score(to), label },
    { fromKey: leaderboardKeys.distance(from), toKey: leaderboardKeys.distance(to), label },
  ]);
}

/**
 * Read every leaderboard key with its members and scores.
 * @param {Object} h Upstash handle.
 * @returns {Promise<Object>} Logical key -> [{value, score}].
 */
export async function exportAll(h) {
  const snapshot = {};
  for (const pattern of PATTERNS) {
    for (const key of await scanKeys(h, pattern)) {
      snapshot[key] = await zRangeWithScores(h, key, 0, -1, false);
    }
  }
  return snapshot;
}

/**
 * Copy one sorted set over another, replacing what was there.
 *
 * Absolute scores, not increments, so re-running converges instead of doubling.
 * The destination is emptied first: writing member-by-member would leave behind
 * anyone present only in the destination, which the 200-entry trim makes
 * reachable -- a player can be trimmed out of the source while surviving in the
 * copy, and would then keep a stale score forever.
 *
 * An empty source is refused BEFORE the delete. Otherwise this wipes the
 * destination and writes nothing back, which is indistinguishable from a
 * successful no-op in the output and destroys real points.
 * @param {Object} h Upstash handle.
 * @param {string} fromKey Source logical key.
 * @param {string} toKey Destination logical key.
 * @param {boolean} apply False to report without writing.
 * @returns {Promise<{members: number, replaced: number, skipped: boolean}>}
 */
export async function copySortedSet(h, fromKey, toKey, apply) {
  const source = await zRangeWithScores(h, fromKey, 0, -1, false);
  const destination = await zRangeWithScores(h, toKey, 0, -1, false);

  if (source.length === 0) {
    if (destination.length > 0) {
      throw new Error(
        `${fromKey} is empty but ${toKey} holds ${destination.length} members. ` +
          'Copying would delete them. Refusing: check KEY_PREFIX and the source key.'
      );
    }
    // Both empty is the ordinary case for a board nobody has played yet.
    return { members: 0, replaced: 0, skipped: true };
  }

  if (apply) {
    await zRemRangeByRank(h, toKey, 0, -1);
    for (const { value, score } of source) await zAdd(h, toKey, score, value);
  }
  return { members: source.length, replaced: destination.length, skipped: false };
}

/**
 * Confirm the backfill landed: each destination must now equal its source.
 *
 * The earlier version verified only the keys it did NOT write, which meant the
 * copy itself was never checked.
 * @param {Object} h Upstash handle.
 * @returns {Promise<string[]>} Pairs that disagree, empty when all match.
 */
export async function verifyTargets(h) {
  const mismatched = [];
  for (const { fromKey, toKey } of backfillPairs()) {
    const source = await zRangeWithScores(h, fromKey, 0, -1, false);
    const destination = await zRangeWithScores(h, toKey, 0, -1, false);
    if (JSON.stringify(source) !== JSON.stringify(destination)) {
      mismatched.push(`${toKey} does not match ${fromKey}`);
    }
  }
  return mismatched;
}

/**
 * Check that no untouched key lost anything while the migration ran.
 *
 * Ordering is deploy-then-migrate, so the app is serving guesses throughout and
 * boards legitimately grow mid-run. Demanding byte-equality would throw on a
 * healthy migration the moment one player scores. Forward-only drift -- members
 * added, scores never reduced, nobody removed -- is expected; anything else is
 * not.
 * @param {Object} before Snapshot taken before the writes.
 * @param {Object} after Snapshot taken after.
 * @returns {string[]} Keys that regressed, empty when all are intact.
 */
export function findRegressions(before, after) {
  const targets = new Set(backfillPairs().map(({ toKey }) => toKey));
  const regressed = [];

  for (const [key, entries] of Object.entries(before)) {
    if (targets.has(key)) continue;
    const now = after[key];
    if (!now) {
      regressed.push(`${key} disappeared`);
      continue;
    }
    const nowByMember = new Map(now.map((e) => [e.value, e.score]));
    for (const { value, score } of entries) {
      if (!nowByMember.has(value)) {
        regressed.push(`${key}: member ${value} removed`);
      } else if (nowByMember.get(value) < score) {
        regressed.push(`${key}: ${value} fell from ${score} to ${nowByMember.get(value)}`);
      }
    }
  }
  return regressed;
}

/**
 * Restore a snapshot, making the backup an actual rollback rather than a file.
 * @param {Object} h Upstash handle.
 * @param {Object} snapshot Output of exportAll.
 * @returns {Promise<number>} Keys restored.
 */
export async function restore(h, snapshot) {
  for (const [key, entries] of Object.entries(snapshot)) {
    await zRemRangeByRank(h, key, 0, -1);
    for (const { value, score } of entries) await zAdd(h, key, score, value);
  }
  return Object.keys(snapshot).length;
}
