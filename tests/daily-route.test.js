import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});
vi.mock('@neondatabase/serverless', async () => {
  const { neonModule } = await import('./mock-neon.js');
  return neonModule();
});

import { GET } from '../src/app/api/daily/route.js';
import { POST as submitGuess } from '../src/app/api/guess/route.js';
import { getDailyRound } from '../src/lib/daily.js';
import { pickPanoBySeed } from '../src/lib/pano-index.js';
import { getGameSession } from '../src/lib/session.js';
import { dailyDay } from '../src/lib/daily-calendar.js';
import { readDay, statsDay } from '../src/lib/stats.js';
import { resetStore, storedKeys, ttlOf } from './redis-harness.js';
import { seedPanoFixtures } from './pano-fixtures.js';

// The daily is the same panorama for everyone, chosen from the day alone and
// cached so the lookup happens once a day rather than once a player.

const ORIGINAL_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;
let mapillaryCalls = 0;

beforeAll(async () => {
  await seedPanoFixtures(false);
});

beforeEach(async () => {
  await resetStore();
  mapillaryCalls = 0;
  process.env.MAPILLARY_ACCESS_TOKEN = 'test-token';
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, init) => {
    if (!String(url).includes('graph.mapillary.com')) return realFetch(url, init);
    mapillaryCalls += 1;
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

describe('pickPanoBySeed', () => {
  it('returns the same panorama for the same seed and a district for it', async () => {
    const first = await pickPanoBySeed('2026-09-21:0');
    const second = await pickPanoBySeed('2026-09-21:0');
    expect(second).toEqual(first);
    expect(first.regionCode).toMatch(/-|^DL$|^DH$/);
  });

  it('varies with the seed', async () => {
    const picks = new Set();
    for (let i = 0; i < 12; i++) picks.add((await pickPanoBySeed(`seed-${i}`)).id);
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('getDailyRound', () => {
  it('resolves once and serves the cached record afterwards, with a two-day TTL', async () => {
    const first = await getDailyRound('2026-09-21');
    const second = await getDailyRound('2026-09-21');
    expect(second).toEqual(first);
    expect(mapillaryCalls).toBe(1);
    expect(first.url).toBe(`https://example.invalid/${first.id}.jpg`);

    const key = (await storedKeys()).find((k) => k.endsWith('daily:2026-09-21'));
    expect(key).toBeDefined();
    const ttl = await ttlOf(key);
    expect(ttl).toBeGreaterThan(47 * 3600);
    expect(ttl).toBeLessThanOrEqual(48 * 3600);
  });
});

describe('GET /api/daily', () => {
  const request = () => GET(new Request('http://localhost/api/daily'));

  it('opens a daily session for today without revealing the answer', async () => {
    const response = await request();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.day).toBe(dailyDay());
    expect(body.number).toBeGreaterThan(0);
    expect(body.imageData.url).toMatch(/^https:/);

    const session = await getGameSession(body.sessionId);
    expect(session.mode).toBe('daily');
    expect(session.pickedRegion).toBe('VN');
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain(session.regionCode);
    expect(serialised).not.toContain('exactLocation');
    // Not asserted: the image URL. The test stub builds it from the id, and
    // the real CDN path is a stable per-image token anyway -- which is why
    // the debug routes that map ids to coordinates are closed in production.
  });

  it('deals every player the same panorama', async () => {
    const a = await getGameSession((await (await request()).json()).sessionId);
    const b = await getGameSession((await (await request()).json()).sessionId);
    expect(a.imageId).toBe(b.imageId);
    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it('is scored by /api/guess like any round and counted under the daily level', async () => {
    const { sessionId } = await (await request()).json();
    const session = await getGameSession(sessionId);
    const body = await (
      await submitGuess(
        new Request('http://localhost/api/guess', {
          method: 'POST',
          body: JSON.stringify({
            username: 'mai',
            sessionId,
            guessLat: session.exactLocation.lat,
            guessLng: session.exactLocation.lng,
          }),
        })
      )
    ).json();
    expect(body.success).toBe(true);
    expect(body.gameResult.score).toBe(5);
    expect((await readDay(statsDay())).byLevel.daily).toEqual({ rounds: 1, zero: 0 });
  });
});
