import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});
vi.mock('@neondatabase/serverless', async () => {
  const { neonModule } = await import('./mock-neon.js');
  return neonModule();
});
// A history store that fails at both ends. Mocked for the whole file, which is
// why it lives here rather than in new-game-route.test.js: an ES module export
// cannot be swapped for one test and swapped back for the next.
vi.mock('../src/lib/pano-history.js', () => ({
  HISTORY_LIMIT: 50,
  HISTORY_TTL: 3 * 24 * 60 * 60,
  getRecentPanoIds: vi.fn(async () => {
    throw new Error('redis unreachable');
  }),
  recordPanoId: vi.fn(async () => {
    throw new Error('redis unreachable');
  }),
}));

import { GET } from '../src/app/api/new-game/route.js';
import { getGameSession } from '../src/lib/session.js';
import { getRecentPanoIds, recordPanoId } from '../src/lib/pano-history.js';
import { resetStore } from './redis-harness.js';
import { seedPanoFixtures } from './pano-fixtures.js';

// The recent-location history is a convenience. The session write next to it is
// not. Redis trouble on the history side must cost a player a repeated
// panorama, never their round -- so the round has to survive both a failed
// lookup and a failed record.

const ORIGINAL_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;

beforeAll(async () => {
  await seedPanoFixtures(false);
});

beforeEach(async () => {
  await resetStore();
  process.env.MAPILLARY_ACCESS_TOKEN = 'test-token';
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, init) => {
    if (!String(url).includes('graph.mapillary.com')) return realFetch(url, init);
    const id = String(url).split('/').pop().split('?')[0];
    return new Response(
      JSON.stringify({
        id,
        thumb_2048_url: `https://example.invalid/${id}.jpg`,
        is_pano: true,
        geometry: { coordinates: [106.7, 10.77] },
      }),
      { status: 200 }
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_TOKEN === undefined) delete process.env.MAPILLARY_ACCESS_TOKEN;
  else process.env.MAPILLARY_ACCESS_TOKEN = ORIGINAL_TOKEN;
});

describe('GET /api/new-game with an unavailable history store', () => {
  it('still serves a complete, playable round', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(new Request('http://localhost/api/new-game?region=DL'));
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.imageData.url).toBeTruthy();
    // The part that must not be skipped: without a session there is nothing to
    // score the guess against.
    expect(await getGameSession(body.sessionId)).toBeTruthy();

    // Both ends were actually attempted, not quietly bypassed.
    expect(getRecentPanoIds).toHaveBeenCalled();
    expect(recordPanoId).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('still issues the player cookie', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await GET(new Request('http://localhost/api/new-game?region=DL'));
    expect(response.headers.get('set-cookie')).toMatch(/vng_pid=/);
    error.mockRestore();
  });
});
