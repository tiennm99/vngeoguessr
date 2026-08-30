import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  foldDiacritics,
  regionSearchKeys,
  searchRegions,
  parsePhotonFeature,
  searchPhoton,
} from '../src/lib/geo-search.js';

describe('foldDiacritics', () => {
  it('strips Vietnamese diacritics including đ', () => {
    expect(foldDiacritics('Bình Thạnh')).toBe('binh thanh');
    expect(foldDiacritics('Đống Đa')).toBe('dong da');
    expect(foldDiacritics('Hoàn Kiếm')).toBe('hoan kiem');
  });

  it('leaves plain ASCII untouched apart from case', () => {
    expect(foldDiacritics('District 7')).toBe('district 7');
  });
});

describe('regionSearchKeys', () => {
  it('adds quan/q aliases for numbered districts', () => {
    const keys = regionSearchKeys({ name: 'District 7' });
    expect(keys).toContain('district 7');
    expect(keys).toContain('quan 7');
    expect(keys).toContain('q7');
  });

  it('adds a space-stripped form for multi-word names', () => {
    expect(regionSearchKeys({ name: 'Hoan Kiem' })).toContain('hoankiem');
  });
});

describe('searchRegions', () => {
  it('matches Vietnamese admin phrasing against the tree names', () => {
    expect(searchRegions('quận 7', 'TPHCM')[0].label).toBe('District 7');
    expect(searchRegions('q7', 'TPHCM')[0].label).toBe('District 7');
    expect(searchRegions('hoàn kiếm', 'VN')[0].label).toBe('Hoan Kiem');
    expect(searchRegions('huyện Hóc Môn', 'VN')[0].label).toBe('Hoc Mon');
  });

  it('scopes results to the played region', () => {
    expect(searchRegions('district 1', 'HN')).toEqual([]);
    expect(searchRegions('tay ho', 'HN')[0].label).toBe('Tay Ho');
  });

  it('returns nothing for junk or too-short queries', () => {
    expect(searchRegions('xyzzy', 'VN')).toEqual([]);
    expect(searchRegions('a', 'VN')).toEqual([]);
    expect(searchRegions('  ', 'VN')).toEqual([]);
  });

  it('caps the list at five normalized results', () => {
    // 'ha' substring-matches well over five districts (Ha Dong, Thach That,
    // Hai Ba Trung, ...), so the cap is actually exercised.
    expect(searchRegions('ha', 'VN')).toHaveLength(5);
    for (const result of searchRegions('tan', 'TPHCM')) {
      expect(result.kind).toBe('region');
      expect(result.center).toHaveLength(2);
      expect(result.bbox).toHaveLength(4);
      expect(typeof result.label).toBe('string');
    }
  });

  it('never returns the root itself', () => {
    expect(searchRegions('ho chi minh', 'TPHCM')).toEqual([]);
  });
});

describe('parsePhotonFeature', () => {
  const feature = {
    geometry: { type: 'Point', coordinates: [106.7, 10.77] },
    properties: {
      name: 'Nguyen Hue',
      district: 'District 1',
      city: 'Ho Chi Minh City',
      // Photon order: [west, north, east, south]
      extent: [106.69, 10.78, 106.71, 10.76],
    },
  };

  it('flips coordinates to [lat, lng] and extent to [w, s, e, n]', () => {
    const result = parsePhotonFeature(feature);
    expect(result.center).toEqual([10.77, 106.7]);
    expect(result.bbox).toEqual([106.69, 10.76, 106.71, 10.78]);
    expect(result.kind).toBe('place');
    expect(result.label).toBe('Nguyen Hue');
    expect(result.sublabel).toBe('District 1, Ho Chi Minh City');
  });

  it('rejects features without coordinates or a name', () => {
    expect(parsePhotonFeature({ geometry: {}, properties: { name: 'x' } })).toBeNull();
    expect(parsePhotonFeature({ geometry: { coordinates: [1, 2] }, properties: {} })).toBeNull();
    expect(parsePhotonFeature(null)).toBeNull();
  });
});

describe('searchPhoton', () => {
  afterEach(() => vi.unstubAllGlobals());

  const okResponse = (body) => ({ ok: true, json: async () => body });

  it('requests the bbox-bounded query and normalizes features', async () => {
    const fetchMock = vi.fn(async () => okResponse({
      features: [
        {
          geometry: { coordinates: [105.85, 21.03] },
          properties: { name: 'Pho Hue', city: 'Hanoi' },
        },
        { geometry: {}, properties: { name: 'broken' } },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchPhoton('pho hue', [105.2, 20.5, 106.0, 21.4], 5, null);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'place', label: 'Pho Hue', center: [21.03, 105.85] });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('photon.komoot.io');
    expect(url).toContain('q=pho+hue');
    expect(url).toContain('limit=5');
    expect(url).toContain(encodeURIComponent('105.2,20.5,106,21.4'));
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    expect(await searchPhoton('anything', null, 5, null)).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    expect(await searchPhoton('anything', null, 5, null)).toBeNull();
  });

  it('rethrows only the caller-initiated abort', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw abortError; }));

    // The caller's signal aborted: superseded, rethrow.
    const controller = new AbortController();
    controller.abort();
    await expect(searchPhoton('anything', null, 5, controller.signal)).rejects.toBe(abortError);

    // Same error without the caller aborting (the internal deadline firing
    // looks like this): the geocoder is unavailable, not superseded.
    expect(await searchPhoton('anything', null, 5, new AbortController().signal)).toBeNull();
  });
});

describe('client safety', () => {
  // Same invariant regions.test.js enforces for regions.js: this module is
  // imported by client components, so its import graph must never reach the
  // panorama data, the pano index, or the boundary barrel.
  const SPECIFIER = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"]([^'"]+)['"]/g;
  const FORBIDDEN = ['data/panos', 'pano-index', 'data/boundaries'];

  const resolveSpecifier = (fromFile, specifier) => {
    if (specifier.startsWith('@/')) return resolve('src', specifier.slice(2));
    if (specifier.startsWith('.')) return resolve(dirname(fromFile), specifier);
    return null;
  };

  it('never reaches server-only data', () => {
    const seen = new Set();
    const walk = (file) => {
      if (seen.has(file) || !existsSync(file)) return;
      seen.add(file);
      for (const [, specifier] of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
        const target = resolveSpecifier(file, specifier);
        if (!target) continue;
        const normalised = target.replace(/\\/g, '/');
        for (const fragment of FORBIDDEN) {
          expect(normalised, `${file} imports ${specifier}`).not.toContain(fragment);
        }
        if (target.endsWith('.js')) walk(target);
      }
    };
    walk(resolve('src/lib/geo-search.js'));

    const relative = [...seen]
      .map((file) => file.replace(/\\/g, '/').split('/src/')[1])
      .sort();
    expect(relative).toEqual([
      'data/regions/counts.js',
      'data/regions/index.js',
      'lib/geo-search.js',
      'lib/regions.js',
    ]);
  });
});
