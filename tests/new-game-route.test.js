import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});
vi.mock('@neondatabase/serverless', async () => {
  const { neonModule } = await import('./mock-neon.js');
  return neonModule();
});

import { GET, POST } from '../src/app/api/new-game/route.js';
import { getGameSession } from '../src/lib/session.js';
import { getRegion, provinceOf } from '../src/lib/regions.js';
import { resetStore } from './redis-harness.js';
import { seedPanoFixtures } from './pano-fixtures.js';

// The district a panorama sits in is the answer to the round. It is resolved
// server-side and stored on the session, and no response before the guess may
// contain it -- naming it collapses a country-wide round to one district.

const ORIGINAL_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;

const request = (query) => new Request(`http://localhost/api/new-game?${query}`);

// The panorama pool behind the Neon mock. Fully district-assigned on purpose:
// these tests assert that province and country draws resolve to a district.
beforeAll(async () => {
  await seedPanoFixtures(false);
});

beforeEach(async () => {
  await resetStore();
  process.env.MAPILLARY_ACCESS_TOKEN = 'test-token';
  // Any Mapillary image id resolves; the point under test is which region gets
  // stored. Everything else passes through -- against a real Redis the Upstash
  // client speaks over fetch too, and swallowing its calls would fail every
  // session write rather than exercising the route.
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

describe('GET /api/new-game', () => {
  it('stores the resolved district, not the region the player picked', async () => {
    const body = await (await GET(request('region=TPHCM'))).json();
    expect(body.success).toBe(true);

    const session = await getGameSession(body.sessionId);
    expect(getRegion(session.regionCode).level).toBe('district');
    expect(provinceOf(session.regionCode)).toBe('TPHCM');
    expect(session.pickedRegion).toBe('TPHCM');
  });

  it('resolves a country round to a district', async () => {
    const body = await (await GET(request('region=VN'))).json();
    const session = await getGameSession(body.sessionId);
    expect(session.regionCode).not.toBe('VN');
    expect(getRegion(session.regionCode).level).toBe('district');
  });

  it('never reveals the resolved district before the guess', async () => {
    // The whole anti-cheat property in one assertion.
    const response = await GET(request('region=VN'));
    const body = await response.json();
    const session = await getGameSession(body.sessionId);

    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain(session.regionCode);
    expect(serialised).not.toContain(String(session.exactLocation.lat));
    expect(serialised).not.toContain(String(session.exactLocation.lng));
  });

  it('describes a country round as Vietnam and nothing narrower', async () => {
    const body = await (await GET(request('region=VN'))).json();
    expect(body.region.path).toEqual(['Vietnam']);
  });

  it('accepts a district directly and keeps it', async () => {
    const body = await (await GET(request('region=DL'))).json();
    const session = await getGameSession(body.sessionId);
    expect(session.regionCode).toBe('DL');
  });

  it('still accepts ?city= from links made before the tree', async () => {
    const body = await (await GET(request('city=HN'))).json();
    expect(body.success).toBe(true);
    expect((await getGameSession(body.sessionId)).pickedRegion).toBe('HN');
  });

  it('rejects an unknown region with 400, not 500', async () => {
    const response = await GET(request('region=NOPE'));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Unknown region/);
  });

  it('rejects a region with no coverage, naming it', async () => {
    const response = await GET(request('region=TPHCM-CUCHI'));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Cu Chi/);
  });

  it('rejects a missing region', async () => {
    expect((await GET(request(''))).status).toBe(400);
  });
});

describe('POST /api/new-game', () => {
  it('exposes the picked region but never the answer', async () => {
    // This handler echoes session fields back to whoever owns the session id --
    // which is the player. Returning the resolved district here would hand them
    // their own answer.
    const created = await (await GET(request('region=VN'))).json();
    const session = await getGameSession(created.sessionId);

    const response = await POST(
      new Request('http://localhost/api/new-game', {
        method: 'POST',
        body: JSON.stringify({ sessionId: created.sessionId }),
      })
    );
    const body = await response.json();

    expect(body.session.pickedRegion).toBe('VN');
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain(session.regionCode);
    expect(serialised).not.toContain('exactLocation');
  });

  it('404s an unknown session', async () => {
    const response = await POST(
      new Request('http://localhost/api/new-game', {
        method: 'POST',
        body: JSON.stringify({ sessionId: 'nope' }),
      })
    );
    expect(response.status).toBe(404);
  });
});
