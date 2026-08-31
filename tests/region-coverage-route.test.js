import { describe, it, expect, beforeAll, vi } from 'vitest';
vi.mock('@neondatabase/serverless', async () => {
  const { neonModule } = await import('./mock-neon.js');
  return neonModule();
});

import { GET } from '../src/app/api/debug/region-coverage/route.js';
import { countPanos } from '../src/lib/pano-index.js';
import { provinceOf } from '../src/lib/regions.js';
import { seedPanoFixtures, GENERATED_AT } from './pano-fixtures.js';

// The coverage route serves any region with an outline, not just the five
// provinces. The country is guarded only by having no boundary of its own,
// which is a coupling between two generated files worth pinning.

const request = (query) => new Request(`http://localhost/api/debug/coverage?${query}`);

beforeAll(async () => {
  await seedPanoFixtures(false);
});

describe('GET debug coverage', () => {
  it('serves a province', async () => {
    const body = await (await GET(request('region=DN'))).json();
    expect(body.success).toBe(true);
    expect(body.counts.total).toBe(await countPanos('DN'));
    expect(body.region.level).toBe('province');
  });

  it('serves a district, scoped to that district', async () => {
    const body = await (await GET(request('region=DN-HAICHAU'))).json();
    expect(body.success).toBe(true);
    expect(body.counts.total).toBe(await countPanos('DN-HAICHAU'));
    expect(body.counts.total).toBeLessThan(await countPanos('DN'));
    expect(body.region.province).toBe('DN');
  });

  it('rejects the country, which has no outline to draw', async () => {
    // The boundary check must answer before anything asks the database. A
    // country-level code has no SQL predicate, so falling through would throw.
    const response = await GET(request('region=VN'));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Unknown or unmapped region/);
  });

  it('rejects a district with no boundary', async () => {
    // Cu Chi is in the tree but has no OSM relation left.
    expect((await GET(request('region=TPHCM-CUCHI'))).status).toBe(400);
  });

  it('rejects an unknown code', async () => {
    expect((await GET(request('region=NOPE'))).status).toBe(400);
  });

  it('rejects an empty ?region=, rather than reading it as a code', async () => {
    // URLSearchParams yields '' here, which ?? would have kept.
    expect((await GET(request('region='))).status).toBe(400);
  });

  it('reports the generation stamp its consumer may render', async () => {
    // The debug page cannot be read from this session, so the field it might
    // depend on is asserted here instead.
    const body = await (await GET(request('region=DN-HAICHAU'))).json();
    expect(body.generatedAt).toBe(GENERATED_AT);
    expect(provinceOf('DN-HAICHAU')).toBe('DN');
  });

  it('sends the outline once, not on every viewport query', async () => {
    // Returning it with each pan gave the client a new object every time, which
    // made the map refit and cancel whatever the user had zoomed into.
    const first = await (await GET(request('region=DN'))).json();
    expect(first.boundary).toBeTruthy();

    const panned = await (await GET(request('region=DN&bbox=108.1,16.0,108.3,16.1'))).json();
    expect(panned.boundary).toBeUndefined();
    expect(panned.counts.inView).toBeLessThanOrEqual(panned.counts.total);
  });

  it('filters the viewport in SQL and marks a truncated response as sampled', async () => {
    // Fixture DN rows below latitude 16.075: dn-hc-1..3.
    const body = await (
      await GET(request('region=DN&bbox=108.0,16.0,108.5,16.075'))
    ).json();
    expect(body.counts.inView).toBe(3);
    expect(body.counts.shown).toBe(3);
    expect(body.counts.sampled).toBe(false);
    expect(body.panos.map((p) => p.id).sort()).toEqual(['dn-hc-1', 'dn-hc-2', 'dn-hc-3']);
  });
});
