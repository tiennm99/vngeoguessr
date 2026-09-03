import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
vi.mock('@neondatabase/serverless', async () => {
  const { neonModule } = await import('./mock-neon.js');
  return neonModule();
});

import { fetchRegionPanorama } from '../src/lib/mapillary.js';
import { provinceOf } from '../src/lib/regions.js';
import { seedPanoFixtures, fixtureIds } from './pano-fixtures.js';

// These stub fetch wholesale, which is safe only because nothing here touches
// Redis -- against a real instance the Upstash client speaks over fetch too.
// The panorama pool comes from the PGlite fake behind the Neon mock.
//
// The district a guess is credited to is resolved here and nowhere else, so
// these tests pin the two behaviours that carry it: the leaf must come from the
// attempt that actually succeeded, and an exhausted pool must not become a 500.

const ORIGINAL_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;

/**
 * A Graph API reply for one image.
 * @param {string} id Image id.
 * @returns {Object} Response body.
 */
function imageBody(id) {
  return {
    id,
    thumb_2048_url: `https://example.invalid/${id}.jpg`,
    is_pano: true,
    geometry: { coordinates: [106.7, 10.77] },
  };
}

beforeAll(async () => {
  await seedPanoFixtures(false);
});

beforeEach(() => {
  process.env.MAPILLARY_ACCESS_TOKEN = 'test-token';
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_TOKEN === undefined) delete process.env.MAPILLARY_ACCESS_TOKEN;
  else process.env.MAPILLARY_ACCESS_TOKEN = ORIGINAL_TOKEN;
});

describe('fetchRegionPanorama', () => {
  it('reports the district of the attempt that succeeded', async () => {
    // Every retry draws a fresh candidate, potentially from a different
    // district. Carrying the first one forward would credit the wrong place.
    const seenIds = [];
    vi.stubGlobal('fetch', async (url) => {
      const id = String(url).split('/').pop().split('?')[0];
      seenIds.push(id);
      // Fail the first lookup, as a deleted image would.
      if (seenIds.length === 1) return new Response('gone', { status: 404 });
      return new Response(JSON.stringify(imageBody(id)), { status: 200 });
    });

    const result = await fetchRegionPanorama('TPHCM');
    expect(result.success).toBe(true);
    expect(seenIds.length).toBe(2);

    // The reported district must be the one holding the SECOND id.
    const winner = seenIds[1];
    expect(fixtureIds(result.data.regionCode)).toContain(winner);
    expect(provinceOf(result.data.regionCode)).toBe('TPHCM');
  });

  it('returns a failure rather than throwing when the pool is exhausted', async () => {
    // Every lookup fails, so all three attempts burn and the retry budget runs
    // out. The route turns this into a message, not a 500.
    vi.stubGlobal('fetch', async () => new Response('gone', { status: 404 }));

    const result = await fetchRegionPanorama('LD');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No panorama could be loaded/);
  });

  it('surfaces an authentication failure instead of retrying it', async () => {
    // A bad token fails identically on every attempt; retrying wastes the
    // budget and buries the real cause.
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response('unauthorized', { status: 401 });
    });

    await expect(fetchRegionPanorama('LD')).rejects.toThrow(/authentication failed/);
    expect(calls).toBe(1);
  });

  it('resolves a district draw to that district', async () => {
    vi.stubGlobal('fetch', async (url) => {
      const id = String(url).split('/').pop().split('?')[0];
      return new Response(JSON.stringify(imageBody(id)), { status: 200 });
    });

    const result = await fetchRegionPanorama('DL');
    expect(result.success).toBe(true);
    expect(result.data.regionCode).toBe('DL');
  });

  it('resolves a country draw to a district, never to the country', async () => {
    vi.stubGlobal('fetch', async (url) => {
      const id = String(url).split('/').pop().split('?')[0];
      return new Response(JSON.stringify(imageBody(id)), { status: 200 });
    });

    const result = await fetchRegionPanorama('VN');
    expect(result.success).toBe(true);
    expect(result.data.regionCode).not.toBe('VN');
    expect(provinceOf(result.data.regionCode)).toBeTruthy();
  });
});

describe('fetchRegionPanorama with a recent-location history', () => {
  /** Stub every Graph API lookup as a success. */
  function stubEveryLookup() {
    vi.stubGlobal('fetch', async (url) => {
      const id = String(url).split('/').pop().split('?')[0];
      return new Response(JSON.stringify(imageBody(id)), { status: 200 });
    });
  }

  it('does not return a panorama the player has just seen', async () => {
    stubEveryLookup();
    const all = fixtureIds('DL');
    const recent = new Set(all.slice(0, all.length - 1));

    // Run it repeatedly: the draw is random, so one pass proves nothing.
    for (let i = 0; i < 12; i += 1) {
      const result = await fetchRegionPanorama('DL', recent);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(all.at(-1));
    }
  });

  // A small district holds a few hundred panoramas. Refusing to repeat one
  // there must never turn into "this region has no coverage".
  it('allows a repeat rather than failing when the history covers the pool', async () => {
    stubEveryLookup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const all = fixtureIds('DL');

    const result = await fetchRegionPanorama('DL', new Set(all));

    expect(result.success).toBe(true);
    expect(all).toContain(result.data.id);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Recent-location filter exhausted DL'));
    warn.mockRestore();
  });

  it('does not spend lookup attempts on the history downgrade', async () => {
    // The downgrade redraws inside the same attempt. Spending one would cost a
    // third of the budget in exactly the small regions that need it most.
    const seenIds = [];
    vi.stubGlobal('fetch', async (url) => {
      const id = String(url).split('/').pop().split('?')[0];
      seenIds.push(id);
      // Fail the first two lookups: only a full budget survives this.
      if (seenIds.length <= 2) return new Response('gone', { status: 404 });
      return new Response(JSON.stringify(imageBody(id)), { status: 200 });
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchRegionPanorama('DL', new Set(fixtureIds('DL')));

    expect(result.success).toBe(true);
    expect(seenIds).toHaveLength(3);
    warn.mockRestore();
  });

  it('still reports a genuinely empty region as a failure', async () => {
    stubEveryLookup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // TPHCM-Q3 is a real district code with no fixture rows behind it.
    const result = await fetchRegionPanorama('TPHCM-Q3', new Set(['hcm-q1-1']));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No panoramas left/);
    // And it must not blame the history for it: a region holding zero rows is
    // a broken reseed, and saying "filter exhausted" sends whoever reads the
    // log to tune HISTORY_LIMIT instead of to the real cause.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('lets an infrastructure error through instead of reading it as coverage', async () => {
    // The regression guard for the soft/hard split: the history downgrade must
    // not swallow a Postgres failure and report it as an exhausted pool.
    stubEveryLookup();
    const { getFakeDb } = await import('./fake-neon.js');
    const db = getFakeDb();
    const broken = vi.spyOn(db, 'query').mockRejectedValue(new Error('connection terminated'));

    await expect(fetchRegionPanorama('DL', new Set(['ld-1']))).rejects.toThrow(/connection terminated/);
    broken.mockRestore();
  });
});
