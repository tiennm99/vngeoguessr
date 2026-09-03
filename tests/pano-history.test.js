import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import {
  getRecentPanoIds,
  recordPanoId,
  HISTORY_LIMIT,
  HISTORY_TTL,
} from '../src/lib/pano-history.js';
import { fakeOnly, resetStore, storedKeys, ttlOf, writeRaw } from './redis-harness.js';

const PLAYER = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER = '11112222-3333-4444-5555-666677778888';
const KEY = `vngeoguessr:history:${PLAYER}`;

describe('recently seen panoramas', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('reports no history for an unknown player', async () => {
    expect(await getRecentPanoIds(PLAYER)).toEqual([]);
  });

  it('records one panorama', async () => {
    await recordPanoId(PLAYER, 'pano-1');
    expect(await getRecentPanoIds(PLAYER)).toEqual(['pano-1']);
  });

  it('returns the newest first', async () => {
    await recordPanoId(PLAYER, 'pano-1');
    await recordPanoId(PLAYER, 'pano-2');
    await recordPanoId(PLAYER, 'pano-3');
    expect(await getRecentPanoIds(PLAYER)).toEqual(['pano-3', 'pano-2', 'pano-1']);
  });

  // The cap is the whole point of the feature's name; a list that grew without
  // bound would eventually exclude a small district's entire pool.
  it('keeps only the last fifty, dropping the oldest', async () => {
    for (let i = 0; i < 60; i += 1) {
      await recordPanoId(PLAYER, `pano-${i}`);
    }
    const recent = await getRecentPanoIds(PLAYER);
    expect(recent).toHaveLength(HISTORY_LIMIT);
    expect(recent[0]).toBe('pano-59');
    expect(recent.at(-1)).toBe('pano-10');
    expect(recent).not.toContain('pano-9');
  });

  // A repeat does get through when a pool is exhausted -- the draw deliberately
  // drops the exclusion rather than erroring -- so re-recording must not spend
  // two of the fifty slots on one panorama.
  it('moves an already-seen panorama to the front without duplicating it', async () => {
    await recordPanoId(PLAYER, 'pano-1');
    await recordPanoId(PLAYER, 'pano-2');
    await recordPanoId(PLAYER, 'pano-1');
    expect(await getRecentPanoIds(PLAYER)).toEqual(['pano-1', 'pano-2']);
  });

  it('namespaces the key under history:', async () => {
    await recordPanoId(PLAYER, 'pano-1');
    expect(await storedKeys()).toEqual([KEY]);
  });

  it('keeps players apart', async () => {
    await recordPanoId(PLAYER, 'mine');
    await recordPanoId(OTHER, 'theirs');
    expect(await getRecentPanoIds(PLAYER)).toEqual(['mine']);
    expect(await getRecentPanoIds(OTHER)).toEqual(['theirs']);
  });

  it('sets a three day expiry', async () => {
    await recordPanoId(PLAYER, 'pano-1');
    const ttl = await ttlOf(KEY);
    expect(ttl).toBeGreaterThan(HISTORY_TTL - 60);
    expect(ttl).toBeLessThanOrEqual(HISTORY_TTL);
  });

  // Rolling, not fixed: an active player should never lose their history, only
  // an idle one should.
  it('refreshes the expiry on every write', fakeOnly, async () => {
    // Only the fake can be fast-forwarded; against real Redis this would mean
    // sleeping two days.
    vi.useFakeTimers();
    try {
      await recordPanoId(PLAYER, 'pano-1');
      vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
      await recordPanoId(PLAYER, 'pano-2');
      const ttl = await ttlOf(KEY);
      expect(ttl).toBeGreaterThan(HISTORY_TTL - 60);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a corrupt value as no history rather than throwing', async () => {
    await writeRaw(KEY, JSON.stringify({ not: 'an array' }));
    await expect(getRecentPanoIds(PLAYER)).resolves.toEqual([]);
    // And the next write repairs it.
    await recordPanoId(PLAYER, 'pano-1');
    expect(await getRecentPanoIds(PLAYER)).toEqual(['pano-1']);
  });
});
