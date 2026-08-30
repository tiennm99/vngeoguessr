import { describe, it, expect } from 'vitest';
import { GET } from '../src/app/api/debug/city-coverage/route.js';
import { countPanos } from '../src/lib/pano-index.js';
import { provinceOf } from '../src/lib/regions.js';

// The coverage route now serves any region with an outline, not just the five
// province indexes. It reaches getRegionPanos, which throws for the country --
// guarded today only by the country having no boundary, which is a coupling
// between two generated files worth pinning.

const request = (query) => new Request(`http://localhost/api/debug/coverage?${query}`);

describe('GET debug coverage', () => {
  it('serves a province', async () => {
    const body = await (await GET(request('region=DN'))).json();
    expect(body.success).toBe(true);
    expect(body.counts.total).toBe(countPanos('DN'));
    expect(body.region.level).toBe('province');
  });

  it('serves a district, scoped to that district', async () => {
    const body = await (await GET(request('region=DN-HAICHAU'))).json();
    expect(body.success).toBe(true);
    expect(body.counts.total).toBe(countPanos('DN-HAICHAU'));
    expect(body.counts.total).toBeLessThan(countPanos('DN'));
    expect(body.region.province).toBe('DN');
  });

  it('rejects the country, which has no outline to draw', async () => {
    // getRegionPanos throws for a country-level code. This must surface as a
    // 400 from the boundary check, not an unhandled throw.
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

  it('still accepts ?city= from the existing debug page', async () => {
    expect((await (await GET(request('city=DN'))).json()).success).toBe(true);
  });

  it('reports the generation stamp its consumer may render', async () => {
    // The debug page cannot be read from this session, so the field it might
    // depend on is asserted here instead.
    const body = await (await GET(request('region=DN-HAICHAU'))).json();
    expect(body.generatedAt).toBeTruthy();
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
});
