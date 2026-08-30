import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import {
  getLeaderboard,
  submitScore,
  submitDistanceRecord,
} from '../src/lib/leaderboard.js';
import { resetStore, storedKeys } from './redis-harness.js';

const MAX_LEADERBOARD_SIZE = 200;

describe('score leaderboard', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('accumulates repeat submissions rather than replacing them', async () => {
    await submitScore('mai', 3, 'TPHCM');
    const second = await submitScore('mai', 4, 'TPHCM');
    expect(second.global.score).toBe(7);
    expect(second.city.score).toBe(7);
  });

  it('keeps city totals independent of each other', async () => {
    await submitScore('mai', 5, 'TPHCM');
    const inHanoi = await submitScore('mai', 2, 'HN');
    expect(inHanoi.city.score).toBe(2);
    // The global total spans both cities.
    expect(inHanoi.global.score).toBe(7);
  });

  it('lowercases the city key', async () => {
    await submitScore('mai', 1, 'TPHCM');
    expect(await storedKeys()).toContain('vngeoguessr:leaderboard:city:tphcm');
  });

  it('ranks the highest total first, counting from one', async () => {
    await submitScore('anh', 2, 'HN');
    await submitScore('binh', 5, 'HN');
    const chi = await submitScore('chi', 4, 'HN');
    expect(chi.city.rank).toBe(2);

    const leaderboard = await getLeaderboard('HN', 10, 'score');
    expect(leaderboard).toEqual([
      { username: 'binh', score: 5, rank: 1 },
      { username: 'chi', score: 4, rank: 2 },
      { username: 'anh', score: 2, rank: 3 },
    ]);
  });

  it('moves a player up as their total grows', async () => {
    await submitScore('anh', 5, 'HN');
    await submitScore('binh', 3, 'HN');
    expect((await submitScore('binh', 4, 'HN')).city.rank).toBe(1);
  });

  it('honours the requested limit', async () => {
    for (const name of ['anh', 'binh', 'chi', 'dung']) {
      await submitScore(name, 1, 'HN');
    }
    expect(await getLeaderboard('HN', 2, 'score')).toHaveLength(2);
  });

  it('returns an empty leaderboard before anyone plays', async () => {
    expect(await getLeaderboard('HN', 10, 'score')).toEqual([]);
  });

  it('keeps only the top entries once the cap is passed', async () => {
    // Trimming is the only thing bounding this key's growth, and it uses a
    // negative rank window that is easy to get backwards.
    const overflow = MAX_LEADERBOARD_SIZE + 5;
    for (let i = 0; i < overflow; i++) {
      await submitScore(`player${String(i).padStart(3, '0')}`, i + 1, 'HN');
    }

    const strongest = `player${String(overflow - 1).padStart(3, '0')}`;

    // Both the city key and the global key are trimmed, by separate calls with
    // separate rank windows, so both need asserting.
    for (const scope of ['HN', null]) {
      const all = await getLeaderboard(scope, overflow, 'score');
      expect(all).toHaveLength(MAX_LEADERBOARD_SIZE);
      // The five weakest players are the ones dropped, not the strongest.
      expect(all[0].username).toBe(strongest);
      expect(all.map((e) => e.username)).not.toContain('player000');
    }
  });

  it.each([
    ['username', ['', 3, 'HN']],
    ['cityCode', ['mai', 3, '']],
  ])('rejects a submission missing %s', async (_field, args) => {
    await expect(submitScore(...args)).rejects.toThrow(/Missing required fields/);
  });

  it('trims surrounding whitespace from the username', async () => {
    const result = await submitScore('  mai  ', 3, 'HN');
    expect(result.global.username).toBe('mai');
    expect((await getLeaderboard('HN', 10, 'score'))[0].username).toBe('mai');
  });
});

describe('distance leaderboard', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('ranks the shortest distance first', async () => {
    await submitDistanceRecord('anh', 900, 'DL');
    await submitDistanceRecord('binh', 120, 'DL');
    const chi = await submitDistanceRecord('chi', 400, 'DL');
    expect(chi.cityDistance.rank).toBe(2);

    const leaderboard = await getLeaderboard('DL', 10, 'distance');
    expect(leaderboard.map((e) => [e.username, e.distance])).toEqual([
      ['binh', 120],
      ['chi', 400],
      ['anh', 900],
    ]);
    expect(leaderboard.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('keeps every attempt instead of overwriting the previous one', async () => {
    // Unlike scores, each distance attempt gets its own slot, so a player can
    // hold several rows.
    await submitDistanceRecord('mai', 500, 'DL');
    await submitDistanceRecord('mai', 80, 'DL');
    const leaderboard = await getLeaderboard('DL', 10, 'distance');
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard.map((e) => e.distance)).toEqual([80, 500]);
  });

  it('decodes the username, distance and timestamp from the entry id', async () => {
    const before = Date.now();
    await submitDistanceRecord('mai', 250, 'DL');
    const [entry] = await getLeaderboard('DL', 10, 'distance');
    expect(entry.username).toBe('mai');
    expect(entry.distance).toBe(250);
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('writes to both the city and the global key', async () => {
    await submitDistanceRecord('mai', 250, 'DL');
    const keys = await storedKeys();
    expect(keys).toContain('vngeoguessr:distance:city:dl');
    expect(keys).toContain('vngeoguessr:distance:vietnam');
    expect(await getLeaderboard(null, 10, 'distance')).toHaveLength(1);
  });

  it('keeps only the closest entries once the cap is passed', async () => {
    const overflow = MAX_LEADERBOARD_SIZE + 5;
    for (let i = 0; i < overflow; i++) {
      await submitDistanceRecord('mai', (i + 1) * 10, 'DL');
    }

    const all = await getLeaderboard('DL', overflow, 'distance');
    expect(all).toHaveLength(MAX_LEADERBOARD_SIZE);
    expect(all[0].distance).toBe(10);
    // The furthest five attempts are the ones dropped.
    expect(all[all.length - 1].distance).toBe(MAX_LEADERBOARD_SIZE * 10);
  });

  it.each([
    ['username', ['', 100, 'DL']],
    ['cityCode', ['mai', 100, '']],
  ])('rejects a submission missing %s', async (_field, args) => {
    await expect(submitDistanceRecord(...args)).rejects.toThrow(/Missing required fields/);
  });
});

describe('global leaderboard', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('spans every city', async () => {
    await submitScore('anh', 5, 'HN');
    await submitScore('binh', 3, 'TPHCM');
    const global = await getLeaderboard(null, 10, 'score');
    expect(global.map((e) => e.username)).toEqual(['anh', 'binh']);
  });

  it('defaults to the score leaderboard', async () => {
    await submitScore('anh', 5, 'HN');
    expect(await getLeaderboard()).toEqual([{ username: 'anh', score: 5, rank: 1 }]);
  });
});
