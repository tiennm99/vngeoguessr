import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The module captures NEXT_PUBLIC_GEOAPIFY_KEY at import time (Next.js inlines
// it at build time, so runtime mutation is impossible in the app). Each test
// therefore stubs the env first and imports a fresh copy of the module.
const importFresh = async () => {
  vi.resetModules();
  return import('../src/lib/map-tiles.js');
};

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getTileConfig', () => {
  it('falls back to the OSM public server with a linked OSM credit', async () => {
    vi.stubEnv('NEXT_PUBLIC_GEOAPIFY_KEY', '');
    const { getTileConfig } = await importFresh();

    // Same tile source the maps hardcoded before the migration; the credit
    // now links to the copyright page, per OSM's attribution guideline.
    expect(getTileConfig()).toEqual({
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
      },
    });
  });

  it('serves Geoapify with its required attribution when a key is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_GEOAPIFY_KEY', 'test-key');
    const { getTileConfig } = await importFresh();

    const tiles = getTileConfig();
    expect(tiles.url).toBe(
      'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=test-key'
    );
    expect(tiles.options.maxZoom).toBe(19);
    // Geoapify's free plan requires all three credits for non-osm-carto
    // styles: Geoapify, OpenMapTiles (schema), and OSM (data).
    expect(tiles.options.attribution).toContain('Powered by');
    expect(tiles.options.attribution).toContain('https://www.geoapify.com/');
    expect(tiles.options.attribution).toContain('© OpenMapTiles');
    expect(tiles.options.attribution).toContain('https://openmaptiles.org/');
    expect(tiles.options.attribution).toContain('© OpenStreetMap contributors');
    expect(tiles.options.attribution).toContain('https://www.openstreetmap.org/copyright');
  });

  it('returns a fresh object per call, so Leaflet cannot mutate shared state', async () => {
    vi.stubEnv('NEXT_PUBLIC_GEOAPIFY_KEY', '');
    const { getTileConfig } = await importFresh();

    const first = getTileConfig();
    const second = getTileConfig();
    expect(first).not.toBe(second);
    expect(first.options).not.toBe(second.options);
  });
});
