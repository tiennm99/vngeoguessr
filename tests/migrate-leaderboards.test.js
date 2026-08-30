import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import { getUpstash, scanKeys, zAdd, zRangeWithScores } from '../src/lib/upstash.js';
import {
  backfillPairs,
  copySortedSet,
  exportAll,
  findRegressions,
  restore,
  verifyTargets,
} from '../scripts/lib/leaderboard-migration.mjs';
import { resetStore } from './redis-harness.js';

// The migration is the one place in this change where existing points can be
// lost, so its guards are exercised against the real functions the script runs.
// An earlier version of this file reimplemented the copy locally, which meant
// the missing empty-source guard was invisible to the suite.

const h = () => getUpstash();

describe('scanKeys', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('finds leaderboard keys and hands them back unprefixed', async () => {
    // Callers work in the logical namespace. A migration that reached past the
    // adapter and scanned 'leaderboard:*' directly would match nothing, because
    // every physical key carries KEY_PREFIX.
    await zAdd(h(), 'leaderboard:city:dl', 5, 'mai');
    await zAdd(h(), 'leaderboard:vietnam', 5, 'mai');
    await zAdd(h(), 'distance:city:dl', 120, 'mai:120:1');

    const found = await scanKeys(h(), 'leaderboard:*');
    expect(found.sort()).toEqual(['leaderboard:city:dl', 'leaderboard:vietnam']);
    for (const key of found) expect(key.startsWith(h().prefix)).toBe(false);
  });

  it('keeps one pattern out of another namespace', async () => {
    await zAdd(h(), 'leaderboard:city:dl', 5, 'mai');
    await zAdd(h(), 'distance:city:dl', 120, 'mai:120:1');
    expect(await scanKeys(h(), 'distance:*')).toEqual(['distance:city:dl']);
  });

  it('returns nothing for a pattern that matches nothing', async () => {
    await zAdd(h(), 'leaderboard:city:dl', 5, 'mai');
    expect(await scanKeys(h(), 'nosuch:*')).toEqual([]);
  });

  it('never returns a duplicate', async () => {
    // SCAN promises each key at least once, not exactly once.
    await zAdd(h(), 'leaderboard:city:dl', 5, 'mai');
    const found = await scanKeys(h(), 'leaderboard:*');
    expect(new Set(found).size).toBe(found.length);
  });
});

describe('backfill safety', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('refuses an empty source that would wipe a populated destination', async () => {
    // The dangerous case: DEL-then-copy with nothing to copy back empties the
    // destination and looks like a clean no-op in the output.
    await zAdd(h(), 'leaderboard:city:ld', 42, 'mai');

    await expect(
      copySortedSet(h(), 'leaderboard:city:dl', 'leaderboard:city:ld', true)
    ).rejects.toThrow(/Refusing/);

    const survived = await zRangeWithScores(h(), 'leaderboard:city:ld', 0, -1, false);
    expect(survived).toEqual([{ value: 'mai', score: 42 }]);
  });

  it('treats both-empty as an ordinary no-op', async () => {
    const result = await copySortedSet(
      h(),
      'leaderboard:city:dh',
      'leaderboard:city:la',
      true
    );
    expect(result.skipped).toBe(true);
  });

  it('writes nothing in dry-run mode', async () => {
    await zAdd(h(), 'leaderboard:city:dl', 12, 'mai');
    await copySortedSet(h(), 'leaderboard:city:dl', 'leaderboard:city:ld', false);
    expect(await zRangeWithScores(h(), 'leaderboard:city:ld', 0, -1, false)).toEqual([]);
  });

  it('copies absolute scores, so running twice is a no-op', async () => {
    await zAdd(h(), 'leaderboard:city:dl', 12, 'mai');
    await zAdd(h(), 'leaderboard:city:dl', 7, 'linh');

    await copySortedSet(h(), 'leaderboard:city:dl', 'leaderboard:city:ld', true);
    const once = await zRangeWithScores(h(), 'leaderboard:city:ld', 0, -1, false);
    await copySortedSet(h(), 'leaderboard:city:dl', 'leaderboard:city:ld', true);
    const twice = await zRangeWithScores(h(), 'leaderboard:city:ld', 0, -1, false);

    // Adding instead of replacing would double every score on the second run.
    expect(twice).toEqual(once);
    expect(once.find((e) => e.value === 'mai').score).toBe(12);
  });

  it('removes a destination-only member instead of stranding it', async () => {
    // Reachable in practice: the 200-entry trim can drop a player from the
    // source while they survive in the copy, and a member-by-member write would
    // leave them there with a stale score forever.
    await zAdd(h(), 'leaderboard:city:dl', 12, 'mai');
    await zAdd(h(), 'leaderboard:city:ld', 999, 'orphan');

    await copySortedSet(h(), 'leaderboard:city:dl', 'leaderboard:city:ld', true);

    const after = await zRangeWithScores(h(), 'leaderboard:city:ld', 0, -1, false);
    expect(after.map((e) => e.value)).toEqual(['mai']);
  });

  it('leaves the source untouched', async () => {
    await zAdd(h(), 'leaderboard:city:dh', 8, 'mai');
    const before = await zRangeWithScores(h(), 'leaderboard:city:dh', 0, -1, false);
    await copySortedSet(h(), 'leaderboard:city:dh', 'leaderboard:city:la', true);
    expect(await zRangeWithScores(h(), 'leaderboard:city:dh', 0, -1, false)).toEqual(before);
  });
});

describe('backfill verification', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('derives its keys from the app, not from hardcoded strings', async () => {
    const pairs = backfillPairs();
    expect(pairs.map((p) => `${p.fromKey}->${p.toKey}`)).toEqual([
      'leaderboard:city:dl->leaderboard:city:ld',
      'distance:city:dl->distance:city:ld',
      'leaderboard:city:dh->leaderboard:city:la',
      'distance:city:dh->distance:city:la',
    ]);
  });

  it('confirms each destination matches its source', async () => {
    await zAdd(h(), 'leaderboard:city:dl', 12, 'mai');
    expect(await verifyTargets(h())).not.toEqual([]);

    await copySortedSet(h(), 'leaderboard:city:dl', 'leaderboard:city:ld', true);
    expect(await verifyTargets(h())).toEqual([]);
  });

  it('reports a destination that never got written', async () => {
    // The earlier verification excluded exactly the keys the script writes, so
    // a failed copy passed silently.
    await zAdd(h(), 'leaderboard:city:dl', 12, 'mai');
    const mismatched = await verifyTargets(h());
    expect(mismatched.join()).toMatch(/leaderboard:city:ld/);
  });
});

describe('regression detection', () => {
  it('accepts forward-only drift from live traffic', () => {
    // Ordering is deploy-then-migrate, so players keep scoring while the script
    // runs. Demanding byte-equality would throw on a healthy migration.
    const before = { 'leaderboard:vietnam': [{ value: 'mai', score: 10 }] };
    const after = {
      'leaderboard:vietnam': [
        { value: 'mai', score: 13 },
        { value: 'linh', score: 4 },
      ],
    };
    expect(findRegressions(before, after)).toEqual([]);
  });

  it('flags a score that went backwards', () => {
    const before = { 'leaderboard:vietnam': [{ value: 'mai', score: 10 }] };
    const after = { 'leaderboard:vietnam': [{ value: 'mai', score: 3 }] };
    expect(findRegressions(before, after).join()).toMatch(/fell from 10 to 3/);
  });

  it('flags a member that disappeared', () => {
    const before = { 'leaderboard:city:hn': [{ value: 'mai', score: 10 }] };
    const after = { 'leaderboard:city:hn': [] };
    expect(findRegressions(before, after).join()).toMatch(/member mai removed/);
  });

  it('flags a key that disappeared', () => {
    const before = { 'leaderboard:city:hn': [{ value: 'mai', score: 10 }] };
    expect(findRegressions(before, {}).join()).toMatch(/disappeared/);
  });

  it('ignores the backfill destinations, which are meant to change', () => {
    const before = { 'leaderboard:city:ld': [{ value: 'orphan', score: 99 }] };
    expect(findRegressions(before, { 'leaderboard:city:ld': [] })).toEqual([]);
  });
});

describe('restore', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('puts a snapshot back, making the backup an actual rollback', async () => {
    await zAdd(h(), 'leaderboard:city:hn', 50, 'mai');
    await zAdd(h(), 'leaderboard:city:hn', 20, 'linh');
    const snapshot = await exportAll(h());

    // Simulate the damage a bad run would do.
    await zAdd(h(), 'leaderboard:city:hn', 1, 'mai');
    await restore(h(), snapshot);

    expect(await exportAll(h())).toEqual(snapshot);
  });
});
