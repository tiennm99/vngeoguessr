import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import { readFileSync } from 'node:fs';
import { getCityIndex, pickRandomPano, countPanos, indexedCities } from '../src/lib/pano-index.js';
import { getRegion } from '../src/lib/regions.js';

// Indexes are built per province, so the province list -- not every node in the
// tree -- is what has one. Districts are served by filtering their province.
const CODES = indexedCities();

describe('panorama index', () => {
  it.each(CODES)('%s has an index with panoramas', (code) => {
    expect(countPanos(code)).toBeGreaterThan(0);
  });

  it('rejects an unknown city', () => {
    expect(() => getCityIndex('NOPE')).toThrow(/No panorama index/);
  });

  it.each(CODES)('%s entries are well formed', (code) => {
    const malformed = getCityIndex(code).panos.find(
      (p) =>
        typeof p.id !== 'string' ||
        p.id.length === 0 ||
        !Number.isFinite(p.lat) ||
        !Number.isFinite(p.lng)
    );
    expect(malformed, `${code} has a malformed entry`).toBeUndefined();
  });

  it.each(CODES)('%s ids are unique', (code) => {
    const ids = getCityIndex(code).panos.map((p) => p.id);
    expect(new Set(ids).size, `${code} has duplicate ids`).toBe(ids.length);
  });

  it.each(CODES)('%s panoramas sit inside the city bbox', (code) => {
    // The index is built from tiles covering the bbox, then clipped to the
    // boundary, so anything outside means the clip or the bbox is wrong.
    const [minLng, minLat, maxLng, maxLat] = getRegion(code).bbox;
    const stray = getCityIndex(code).panos.find(
      (p) => p.lat < minLat || p.lat > maxLat || p.lng < minLng || p.lng > maxLng
    );
    expect(stray, `${code} has a panorama outside its bbox`).toBeUndefined();
  });

  it.each(CODES)('%s panoramas sit inside the city boundary', (code) => {
    const boundary = JSON.parse(
      readFileSync(`src/data/boundaries/${code.toLowerCase()}/${code.toLowerCase()}.json`, 'utf8')
    );
    // Sample rather than test every point: booleanPointInPolygon against a
    // detailed outline is slow, and a clipping bug would not hide in a sample.
    const panos = getCityIndex(code).panos;
    const step = Math.max(1, Math.floor(panos.length / 200));
    for (let i = 0; i < panos.length; i += step) {
      const inside = turf.booleanPointInPolygon(
        turf.point([panos[i].lng, panos[i].lat]),
        boundary
      );
      expect(inside, `${code} pano ${panos[i].id} is outside the boundary`).toBe(true);
    }
  });

  it.each(CODES)('%s index bbox agrees with the region tree', (code) => {
    expect(getCityIndex(code).bbox).toEqual(getRegion(code).bbox);
  });
});

describe('pickRandomPano', () => {
  it('returns an entry from the province', () => {
    const chosen = pickRandomPano('LD');
    expect(getCityIndex('LD').panos.some((p) => p.id === chosen.id)).toBe(true);
  });

  it('never returns an excluded id', () => {
    const { panos } = getCityIndex('LD');
    const exclude = new Set(panos.slice(0, panos.length - 1).map((p) => p.id));
    // Only one candidate is left, so the choice is forced and checkable.
    expect(pickRandomPano('LD', exclude).id).toBe(panos[panos.length - 1].id);
  });

  it('throws when everything is excluded', () => {
    const all = new Set(getCityIndex('LD').panos.map((p) => p.id));
    expect(() => pickRandomPano('LD', all)).toThrow(/No panoramas left/);
  });

  it('spreads across the index rather than returning one entry', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(pickRandomPano('LD').id);
    expect(seen.size).toBeGreaterThan(10);
  });
});
