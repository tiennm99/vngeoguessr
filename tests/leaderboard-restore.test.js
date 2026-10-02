import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import { getUpstash, zAdd, zRangeWithScores } from '../src/lib/upstash.js';
import { parseBackup, restoreBoards } from '../scripts/lib/leaderboard-restore.mjs';
import { resetStore } from './redis-harness.js';

/** A board as the export writes it: ascending, { member, score }. */
async function readBoard(key) {
  const entries = await zRangeWithScores(getUpstash(), key, 0, -1, false);
  return entries.map(({ value, score }) => ({ member: value, score }));
}

function backupText(boards) {
  return JSON.stringify({ exportedAt: '2026-10-02T00:00:00.000Z', prefix: 'vngeoguessr:', boards });
}

describe('parseBackup', () => {
  it('accepts what the export writes', () => {
    const backup = parseBackup(
      backupText({
        'leaderboard:vietnam': [{ member: 'an', score: 12 }],
        'distance:city:tphcm-q7': [{ member: 'binh', score: 0.4 }],
      })
    );
    expect(backup.exportedAt).toBe('2026-10-02T00:00:00.000Z');
    expect(backup.prefix).toBe('vngeoguessr:');
    expect(Object.keys(backup.boards)).toEqual(['leaderboard:vietnam', 'distance:city:tphcm-q7']);
  });

  it('refuses keys that are not score or distance boards', () => {
    expect(() => parseBackup(backupText({ 'session:abc': [] }))).toThrow(/unexpected key/);
    expect(() => parseBackup(backupText({ 'leaderboard:': [] }))).toThrow(/unexpected key/);
  });

  it('refuses malformed entries', () => {
    expect(() => parseBackup(backupText({ 'leaderboard:vietnam': [{ member: 'an', score: 'x' }] }))).toThrow(
      /invalid entry/
    );
    expect(() => parseBackup(backupText({ 'leaderboard:vietnam': [{ member: '', score: 1 }] }))).toThrow(
      /invalid entry/
    );
    expect(() => parseBackup(backupText({ 'leaderboard:vietnam': 'nope' }))).toThrow(/not a list/);
  });

  it('refuses a file with no boards', () => {
    expect(() => parseBackup('{"exportedAt":"x"}')).toThrow(/no "boards"/);
  });
});

describe('restoreBoards', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('merges: sets backed-up scores and keeps newer members', async () => {
    const h = getUpstash();
    await zAdd(h, 'leaderboard:vietnam', 99, 'an');
    await zAdd(h, 'leaderboard:vietnam', 5, 'newcomer');

    const result = await restoreBoards(h, { 'leaderboard:vietnam': [{ member: 'an', score: 40 }] }, false);

    expect(result).toEqual({ boards: 1, members: 1 });
    expect(await readBoard('leaderboard:vietnam')).toEqual([
      { member: 'newcomer', score: 5 },
      { member: 'an', score: 40 },
    ]);
  });

  it('replaces: each board ends up exactly as backed up', async () => {
    const h = getUpstash();
    await zAdd(h, 'leaderboard:vietnam', 5, 'newcomer');
    await zAdd(h, 'leaderboard:city:dl', 7, 'untouched');

    await restoreBoards(h, { 'leaderboard:vietnam': [{ member: 'an', score: 40 }] }, true);

    expect(await readBoard('leaderboard:vietnam')).toEqual([{ member: 'an', score: 40 }]);
    // A board the backup does not mention is left alone.
    expect(await readBoard('leaderboard:city:dl')).toEqual([{ member: 'untouched', score: 7 }]);
  });

  it('writes a board larger than one ZADD chunk in full', async () => {
    const h = getUpstash();
    const entries = Array.from({ length: 2500 }, (_, i) => ({ member: `p${i}`, score: i }));

    await restoreBoards(h, { 'distance:vietnam': entries }, false);

    expect(await readBoard('distance:vietnam')).toHaveLength(2500);
  });

  it('round-trips an export: the restored boards read back identically', async () => {
    const h = getUpstash();
    const boards = {
      'leaderboard:vietnam': [
        { member: 'binh', score: 3 },
        { member: 'an', score: 12 },
      ],
      'distance:city:tphcm': [{ member: 'an', score: 0.25 }],
    };

    await restoreBoards(h, parseBackup(backupText(boards)).boards, true);

    for (const [key, entries] of Object.entries(boards)) {
      expect(await readBoard(key)).toEqual(entries);
    }
  });
});
