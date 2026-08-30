import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import {
  getUpstash,
  getJson,
  putJson,
  del,
  zAdd,
  zScore,
  zRangeWithScores,
  zRank,
  zRevRank,
  zRemRangeByRank,
} from '../src/lib/upstash.js';
import { fakeOnly, resetStore, storedKeys, ttlOf, writeRaw } from './redis-harness.js';

describe('upstash adapter', () => {
  beforeEach(async () => {
    await resetStore();
  });

  describe('handle', () => {
    it('is a singleton', () => {
      expect(getUpstash()).toBe(getUpstash());
    });

    it('carries the default key prefix', () => {
      expect(getUpstash().prefix).toBe('vngeoguessr:');
    });
  });

  describe('key prefixing', () => {
    // Every physical key must carry the prefix so the project can share an
    // Upstash database with others without colliding. Callers pass logical keys
    // and never see it, so only a store-level assertion can catch a regression.
    it('prefixes string keys', async () => {
      const h = getUpstash();
      await putJson(h, 'session:abc', { city: 'HN' }, null);
      expect(await storedKeys()).toEqual(['vngeoguessr:session:abc']);
    });

    it('prefixes sorted set keys', async () => {
      const h = getUpstash();
      await zAdd(h, 'leaderboard:vietnam', 5, 'mai');
      expect(await storedKeys()).toEqual(['vngeoguessr:leaderboard:vietnam']);
    });
  });

  describe('getJson / putJson / del', () => {
    it('round-trips an object', async () => {
      const h = getUpstash();
      const session = { sessionId: 'abc', exactLocation: { lat: 10.8, lng: 106.6 } };
      await putJson(h, 'session:abc', session, null);
      expect(await getJson(h, 'session:abc')).toEqual(session);
    });

    it('returns null for a missing key', async () => {
      expect(await getJson(getUpstash(), 'session:nope')).toBeNull();
    });

    it('reads a value written outside the adapter', async () => {
      // Some SDK versions parse JSON before the adapter sees it, others hand
      // back the raw string; getJson has to cope with either without
      // double-parsing.
      const h = getUpstash();
      await writeRaw('vngeoguessr:session:raw', JSON.stringify({ city: 'DL' }));
      expect(await getJson(h, 'session:raw')).toEqual({ city: 'DL' });
    });

    it('applies a TTL when one is given', async () => {
      const h = getUpstash();
      await putJson(h, 'session:ttl', { a: 1 }, 60);
      const ttl = await ttlOf('vngeoguessr:session:ttl');
      expect(ttl).toBeGreaterThan(55);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('leaves a key persistent when no TTL is given', async () => {
      const h = getUpstash();
      await putJson(h, 'session:forever', { a: 1 }, null);
      expect(await ttlOf('vngeoguessr:session:forever')).toBe(-1);
    });

    it('deletes a key', async () => {
      const h = getUpstash();
      await putJson(h, 'session:gone', { a: 1 }, null);
      await del(h, 'session:gone');
      expect(await getJson(h, 'session:gone')).toBeNull();
    });
  });

  describe('sorted sets', () => {
    async function seed(h) {
      await zAdd(h, 'lb', 10, 'anh');
      await zAdd(h, 'lb', 30, 'binh');
      await zAdd(h, 'lb', 20, 'chi');
    }

    it('reads back a score', async () => {
      const h = getUpstash();
      await seed(h);
      expect(await zScore(h, 'lb', 'binh')).toBe(30);
    });

    it('returns null for an absent member', async () => {
      expect(await zScore(getUpstash(), 'lb', 'ghost')).toBeNull();
    });

    it('overwrites rather than accumulating on re-add', async () => {
      const h = getUpstash();
      await zAdd(h, 'lb', 10, 'anh');
      await zAdd(h, 'lb', 25, 'anh');
      expect(await zScore(h, 'lb', 'anh')).toBe(25);
    });

    it('ranges ascending', async () => {
      const h = getUpstash();
      await seed(h);
      expect(await zRangeWithScores(h, 'lb', 0, -1, false)).toEqual([
        { value: 'anh', score: 10 },
        { value: 'chi', score: 20 },
        { value: 'binh', score: 30 },
      ]);
    });

    it('ranges descending', async () => {
      const h = getUpstash();
      await seed(h);
      expect(await zRangeWithScores(h, 'lb', 0, -1, true)).toEqual([
        { value: 'binh', score: 30 },
        { value: 'chi', score: 20 },
        { value: 'anh', score: 10 },
      ]);
    });

    it('honours a limit', async () => {
      const h = getUpstash();
      await seed(h);
      const top = await zRangeWithScores(h, 'lb', 0, 1, true);
      expect(top.map((e) => e.value)).toEqual(['binh', 'chi']);
    });

    it('reshapes the object form the older SDK returns', fakeOnly, async () => {
      // lib/upstash.js normalises two different withScores shapes; the flat one
      // is covered by every other case here, so pin the object one too.
      const h = getUpstash();
      await seed(h);
      const { FakeRedis } = await import('./fake-upstash-redis.js');
      FakeRedis.latest().withScoresShape = 'objects';
      expect(await zRangeWithScores(h, 'lb', 0, -1, true)).toEqual([
        { value: 'binh', score: 30 },
        { value: 'chi', score: 20 },
        { value: 'anh', score: 10 },
      ]);
    });

    it('returns an empty list for a missing key', async () => {
      expect(await zRangeWithScores(getUpstash(), 'lb:missing', 0, -1, true)).toEqual([]);
    });

    it('ranks ascending and descending', async () => {
      const h = getUpstash();
      await seed(h);
      expect(await zRank(h, 'lb', 'anh')).toBe(0);
      expect(await zRevRank(h, 'lb', 'anh')).toBe(2);
      expect(await zRevRank(h, 'lb', 'binh')).toBe(0);
    });

    it('returns a null rank for an absent member', async () => {
      const h = getUpstash();
      await seed(h);
      expect(await zRank(h, 'lb', 'ghost')).toBeNull();
      expect(await zRevRank(h, 'lb', 'ghost')).toBeNull();
    });

    it('trims by rank', async () => {
      const h = getUpstash();
      await seed(h);
      const removed = await zRemRangeByRank(h, 'lb', 0, 0);
      expect(removed).toBe(1);
      const remaining = await zRangeWithScores(h, 'lb', 0, -1, false);
      expect(remaining.map((e) => e.value)).toEqual(['chi', 'binh']);
    });

    it('removes nothing when the trim window falls outside the set', async () => {
      // This is the shape submitScore uses: with fewer members than the cap, the
      // negative stop resolves below the start and must be a no-op.
      const h = getUpstash();
      await seed(h);
      expect(await zRemRangeByRank(h, 'lb', 0, -201)).toBe(0);
      expect(await zRangeWithScores(h, 'lb', 0, -1, false)).toHaveLength(3);
    });
  });
});
