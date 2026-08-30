import { describe, it, expect } from 'vitest';
import {
  resolveRegion,
  resolvePlayableRegion,
  publicRegion,
} from '../src/lib/region-request.js';

const params = (query) => new URLSearchParams(query);

describe('resolveRegion', () => {
  it('accepts a region at any level', () => {
    for (const code of ['VN', 'TPHCM', 'TPHCM-Q7', 'DL']) {
      expect(resolveRegion(params(`region=${code}`), true)).toEqual({ ok: true, code });
    }
  });

  it('still accepts ?city=, which every existing link sends', () => {
    expect(resolveRegion(params('city=HN'), true)).toEqual({ ok: true, code: 'HN' });
  });

  it('prefers region over city when both are present', () => {
    expect(resolveRegion(params('region=DL&city=HN'), true).code).toBe('DL');
  });

  it('uppercases what it is given', () => {
    expect(resolveRegion(params('region=tphcm-q7'), true).code).toBe('TPHCM-Q7');
  });

  it('treats an absent region as the country when one is optional', () => {
    expect(resolveRegion(params(''), false)).toEqual({ ok: true, code: 'VN' });
  });

  it('treats an empty region as the country rather than an error', () => {
    // ?city= with no value is what a cleared filter sends, and it used to mean
    // the global board.
    expect(resolveRegion(params('city='), false)).toEqual({ ok: true, code: 'VN' });
  });

  it('rejects an unknown code with a 400, not an empty result', () => {
    const result = resolveRegion(params('region=NOPE'), true);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/Unknown region: NOPE/);
  });

  it('rejects a missing region when one is required', () => {
    expect(resolveRegion(params(''), true).status).toBe(400);
  });
});

describe('resolvePlayableRegion', () => {
  it('accepts a region with coverage', () => {
    expect(resolvePlayableRegion(params('region=DL')).ok).toBe(true);
  });

  it.each(['TPHCM-CUCHI', 'DN-CAMLE', 'DN-HOAVANG'])(
    'rejects %s, which has no coverage',
    (code) => {
      // Better here than as "no panoramas left to try" from deep inside the
      // draw. Cu Chi has no boundary; the two Da Nang districts have no imagery.
      const result = resolvePlayableRegion(params(`region=${code}`));
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/no street view coverage/);
    }
  );
});

describe('publicRegion', () => {
  it('describes what the player picked', () => {
    expect(publicRegion('TPHCM')).toEqual({
      code: 'TPHCM',
      name: 'Ho Chi Minh',
      path: ['Vietnam', 'Ho Chi Minh'],
      level: 'province',
    });
  });

  it('gives the country a one-element path', () => {
    // A country round must not hint at a province, let alone a district.
    expect(publicRegion('VN').path).toEqual(['Vietnam']);
  });

  it('carries no coordinates', () => {
    const serialised = JSON.stringify(publicRegion('DL'));
    expect(serialised).not.toMatch(/lat|lng|bbox|center/);
  });
});
