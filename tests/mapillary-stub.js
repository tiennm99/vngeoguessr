import { afterEach, beforeEach, vi } from 'vitest';

// A Mapillary Graph API that resolves any image id, installed around every
// test of the file that calls it. Everything else passes through -- against a
// real Redis the Upstash client speaks over fetch too, and swallowing its calls
// would fail every session write rather than exercising the route.

/**
 * Stub Mapillary for every test in the calling file, with a token set.
 * @param {(id: string) => Response|undefined} [override] Called per lookup;
 *   a Response it returns replaces the default image answer.
 * @returns {void}
 */
export function stubMapillary(override) {
  const originalToken = process.env.MAPILLARY_ACCESS_TOKEN;

  beforeEach(() => {
    process.env.MAPILLARY_ACCESS_TOKEN = 'test-token';
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, init) => {
      if (!String(url).includes('graph.mapillary.com')) return realFetch(url, init);
      const id = String(url).split('/').pop().split('?')[0];
      return override?.(id) ?? new Response(
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
    if (originalToken === undefined) delete process.env.MAPILLARY_ACCESS_TOKEN;
    else process.env.MAPILLARY_ACCESS_TOKEN = originalToken;
  });
}
