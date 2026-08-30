import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import {
  storeGameSession,
  getGameSession,
  deleteGameSession,
} from '../src/lib/session.js';
import { fakeOnly, resetStore, storedKeys, ttlOf } from './redis-harness.js';

const SESSION = {
  sessionId: 'sess-1',
  cityCode: 'TPHCM',
  exactLocation: { lat: 10.7769, lng: 106.7009 },
  imageId: '123456789',
  createdAt: 1_700_000_000_000,
};

describe('game sessions', () => {
  beforeEach(async () => {
    await resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips a session', async () => {
    await storeGameSession('sess-1', SESSION);
    expect(await getGameSession('sess-1')).toEqual(SESSION);
  });

  it('returns null for an unknown session', async () => {
    expect(await getGameSession('never-existed')).toBeNull();
  });

  it('namespaces the key under session:', async () => {
    await storeGameSession('sess-1', SESSION);
    expect(await storedKeys()).toEqual(['vngeoguessr:session:sess-1']);
  });

  it('keeps sessions separate', async () => {
    await storeGameSession('sess-1', SESSION);
    await storeGameSession('sess-2', { ...SESSION, sessionId: 'sess-2', cityCode: 'HN' });
    expect((await getGameSession('sess-1')).cityCode).toBe('TPHCM');
    expect((await getGameSession('sess-2')).cityCode).toBe('HN');
  });

  it('overwrites on re-store', async () => {
    await storeGameSession('sess-1', SESSION);
    await storeGameSession('sess-1', { ...SESSION, imageId: 'replaced' });
    expect((await getGameSession('sess-1')).imageId).toBe('replaced');
  });

  it('deletes a session', async () => {
    await storeGameSession('sess-1', SESSION);
    await deleteGameSession('sess-1');
    expect(await getGameSession('sess-1')).toBeNull();
  });

  it('tolerates deleting a session that is already gone', async () => {
    await expect(deleteGameSession('never-existed')).resolves.toBe(true);
  });

  it('sets a thirty minute expiry', async () => {
    // The TTL is what stops an abandoned round's coordinates from lingering in
    // Redis, so it is worth pinning rather than trusting the constant.
    await storeGameSession('sess-1', SESSION);
    const ttl = await ttlOf('vngeoguessr:session:sess-1');
    expect(ttl).toBeGreaterThan(29 * 60);
    expect(ttl).toBeLessThanOrEqual(30 * 60);
  });

  it('stops returning a session once the expiry passes', fakeOnly, async () => {
    // Only the fake can be fast-forwarded; against real Redis this would mean
    // sleeping half an hour.
    vi.useFakeTimers();
    await storeGameSession('sess-1', SESSION);

    vi.advanceTimersByTime(29 * 60 * 1000);
    expect(await getGameSession('sess-1')).toEqual(SESSION);

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(await getGameSession('sess-1')).toBeNull();
  });
});
