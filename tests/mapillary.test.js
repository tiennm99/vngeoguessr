import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCityPanorama } from '../src/lib/mapillary.js';
import { getRegionPanos } from '../src/lib/pano-index.js';
import { provinceOf } from '../src/lib/regions.js';

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

beforeEach(() => {
  process.env.MAPILLARY_ACCESS_TOKEN = 'test-token';
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_TOKEN === undefined) delete process.env.MAPILLARY_ACCESS_TOKEN;
  else process.env.MAPILLARY_ACCESS_TOKEN = ORIGINAL_TOKEN;
});

describe('fetchCityPanorama', () => {
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

    const result = await fetchCityPanorama('TPHCM');
    expect(result.success).toBe(true);
    expect(seenIds.length).toBe(2);

    // The reported district must be the one holding the SECOND id.
    const winner = seenIds[1];
    expect(getRegionPanos(result.data.regionCode).some((p) => p.id === winner)).toBe(true);
    expect(provinceOf(result.data.regionCode)).toBe('TPHCM');
  });

  it('returns a failure rather than throwing when the pool is exhausted', async () => {
    // Every lookup fails, so all three attempts burn and the retry budget runs
    // out. The route turns this into a message, not a 500.
    vi.stubGlobal('fetch', async () => new Response('gone', { status: 404 }));

    const result = await fetchCityPanorama('LD');
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

    await expect(fetchCityPanorama('LD')).rejects.toThrow(/authentication failed/);
    expect(calls).toBe(1);
  });

  it('resolves a district draw to that district', async () => {
    vi.stubGlobal('fetch', async (url) => {
      const id = String(url).split('/').pop().split('?')[0];
      return new Response(JSON.stringify(imageBody(id)), { status: 200 });
    });

    const result = await fetchCityPanorama('DL');
    expect(result.success).toBe(true);
    expect(result.data.regionCode).toBe('DL');
  });

  it('resolves a country draw to a district, never to the country', async () => {
    vi.stubGlobal('fetch', async (url) => {
      const id = String(url).split('/').pop().split('?')[0];
      return new Response(JSON.stringify(imageBody(id)), { status: 200 });
    });

    const result = await fetchCityPanorama('VN');
    expect(result.success).toBe(true);
    expect(result.data.regionCode).not.toBe('VN');
    expect(provinceOf(result.data.regionCode)).toBeTruthy();
  });
});
