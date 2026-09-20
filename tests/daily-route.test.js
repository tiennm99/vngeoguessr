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
import { getLeaderboard } from '../src/lib/leaderboard.js';
import { seedPanoFixtures } from './pano-fixtures.js';

// The daily is the same panorama for everyone, chosen from the day alone and
// cached so the lookup happens once a day rather than once a player.

const ORIGINAL_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;
let mapillaryCalls = 0;
// Ids the Mapillary stub refuses, to simulate images deleted upstream.
const deadIds = new Set();

beforeAll(async () => {
  await seedPanoFixtures(false);
});

beforeEach(async () => {
  await resetStore();
  mapillaryCalls = 0;
  deadIds.clear();
  process.env.MAPILLARY_ACCESS_TOKEN = 'test-token';
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, init) => {
    if (!String(url).includes('graph.mapillary.com')) return realFetch(url, init);
    mapillaryCalls += 1;
    const id = String(url).split('/').pop().split('?')[0];
    if (deadIds.has(id)) return new Response('gone', { status: 404 });
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
  it('caches the pick for two days and resolves the image on every call', async () => {
    const first = await getDailyRound('2026-09-21');
    const second = await getDailyRound('2026-09-21');
    expect(second).toEqual(first);
    // One lookup per call: the URL is never cached, so a signed URL that
    // stops working cannot break the day.
    expect(mapillaryCalls).toBe(2);
    expect(first.url).toBe(`https://example.invalid/${first.id}.jpg`);

    const key = (await storedKeys()).find((k) => k.endsWith('daily:2026-09-21'));
    expect(key).toBeDefined();
    const ttl = await ttlOf(key);
    expect(ttl).toBeGreaterThan(47 * 3600);
    expect(ttl).toBeLessThanOrEqual(48 * 3600);
  });

  it('replaces a cached pick that no longer resolves', async () => {
    const first = await getDailyRound('2026-09-22');
    deadIds.add(first.id);
    const replacement = await getDailyRound('2026-09-22');
    expect(replacement.id).not.toBe(first.id);
    // And the replacement is what the day now serves.
    expect((await getDailyRound('2026-09-22')).id).toBe(replacement.id);
  });

  it('gives up on the day when every seeded candidate fails', async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      deadIds.add((await pickPanoBySeed(`2026-09-23:${attempt}`)).id);
    }
    await expect(getDailyRound('2026-09-23')).rejects.toThrow(/No daily panorama/);
    expect((await storedKeys()).some((k) => k.endsWith('daily:2026-09-23'))).toBe(false);
  });
});

describe('GET /api/daily', () => {
  const request = () => GET(new Request('http://localhost/api/daily'));

  it('opens a daily session for today without revealing the answer', async () => {
    // Bracketed rather than compared to one reading, so a run that straddles
    // midnight in Vietnam does not flake.
    const before = dailyDay();
    const response = await request();
    const after = dailyDay();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect([before, after]).toContain(body.day);
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

  it('answers 500 when the day has no loadable panorama', async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      deadIds.add((await pickPanoBySeed(`${dailyDay()}:${attempt}`)).id);
    }
    const response = await request();
    expect(response.status).toBe(500);
    expect((await response.json()).success).toBe(false);
  });

  it('is scored by /api/guess and counted, but credits no leaderboard', async () => {
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
    // The same panorama all day plus the answer in this response would make
    // any board it fed farmable, so it feeds none.
    expect(body.gameResult.levels).toEqual([]);
    expect(await getLeaderboard('VN', 10, 'score')).toEqual([]);
    expect((await storedKeys()).filter((k) => k.includes('leaderboard:') || k.includes('distance:'))).toEqual([]);
  });
});
