import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import {
  recordRound,
  readDay,
  statsDay,
  statsDays,
  distinctPlayersAcross,
  STATS_TTL_DAYS,
} from '../src/lib/stats.js';
import { resetStore, storedKeys, ttlOf } from './redis-harness.js';

const DAY1 = Date.UTC(2026, 8, 20, 12);
const DAY2 = Date.UTC(2026, 8, 21, 12);
const P1 = '0f4ee9e6-4a0b-4c1e-9a8a-1c2d3e4f5a6b';
const P2 = '1f4ee9e6-4a0b-4c1e-9a8a-1c2d3e4f5a6b';

describe('daily statistics', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('buckets rounds by UTC day, picked level and score', async () => {
    await recordRound('country', 0, P1, DAY1);
    await recordRound('country', 0, P2, DAY1);
    await recordRound('district', 5, P1, DAY1);
    await recordRound('district', 2, P1, DAY2);

    expect(statsDay(DAY1)).toBe('2026-09-20');
    const day1 = await readDay('2026-09-20');
    expect(day1.rounds).toBe(3);
    expect(day1.players).toBe(2);
    expect(day1.byLevel).toEqual({
      country: { rounds: 2, zero: 2 },
      district: { rounds: 1, zero: 0 },
    });
    expect(await statsDays()).toEqual(['2026-09-20', '2026-09-21']);
  });

  it('counts a player once across days for the repeat estimate', async () => {
    await recordRound('country', 1, P1, DAY1);
    await recordRound('country', 1, P1, DAY2);
    await recordRound('country', 1, P2, DAY2);
    expect(await distinctPlayersAcross(['2026-09-20', '2026-09-21'])).toBe(2);
  });

  it('expires both keys and keeps no per-player record', async () => {
    await recordRound('province', 3, P1, DAY1);
    const keys = await storedKeys();
    expect(keys).toEqual([
      'vngeoguessr:stats:2026-09-20',
      'vngeoguessr:stats:players:2026-09-20',
    ]);
    for (const key of keys) {
      const ttl = await ttlOf(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(STATS_TTL_DAYS * 24 * 60 * 60);
    }
  });

  it('gives the player key a TTL even when the day opened with a cookieless round', async () => {
    // The HyperLogLog is created by the second round here, after the hash's
    // first field; its TTL must ride on its own first write.
    await recordRound('country', 0, null, DAY1);
    await recordRound('country', 0, P1, DAY1);
    expect(await ttlOf('vngeoguessr:stats:players:2026-09-20')).toBeGreaterThan(0);
  });

  it("expires each day's keys independently", async () => {
    await recordRound('country', 0, P1, DAY1);
    await recordRound('country', 0, P1, DAY2);
    for (const day of ['2026-09-20', '2026-09-21']) {
      expect(await ttlOf(`vngeoguessr:stats:${day}`)).toBeGreaterThan(0);
      expect(await ttlOf(`vngeoguessr:stats:players:${day}`)).toBeGreaterThan(0);
    }
  });

  it('tolerates a round with no player id', async () => {
    await recordRound('district', 4, null, DAY1);
    const day = await readDay('2026-09-20');
    expect(day.rounds).toBe(1);
    expect(day.players).toBe(0);
  });

  it('reads an empty day as zeros', async () => {
    expect(await readDay('2000-01-01')).toEqual({ day: '2000-01-01', rounds: 0, players: 0, byLevel: {} });
  });
});
