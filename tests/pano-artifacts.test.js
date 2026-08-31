import { describe, it, expect } from 'vitest';
import { validatePanoArtifact } from '../scripts/lib/pano-artifacts.mjs';

// The data-quality gate scripts/seed-pano-db.mjs runs before uploading
// anything. These invariants used to be assertions against the committed JSON
// index; the artifacts are no longer in the repo, so the gate itself is what
// gets pinned here, with synthetic artifacts.

const BBOX = [108.0, 11.0, 109.0, 12.0];
const DISTRICTS = ['DL'];

/** A minimal artifact that passes every check; override to break one. */
function artifact(overrides) {
  return {
    code: 'LD',
    districts: ['DL'],
    districtCounts: { DL: 2 },
    stranded: 0,
    worstStrandedKm: 0,
    unassigned: 0,
    panos: [
      { id: 'a', lat: 11.5, lng: 108.5, d: 0 },
      { id: 'b', lat: 11.6, lng: 108.6, d: 0 },
    ],
    ...overrides,
  };
}

const validate = (index) => () => validatePanoArtifact('LD', index, BBOX, DISTRICTS);

describe('validatePanoArtifact', () => {
  it('accepts a well-formed artifact', () => {
    expect(validate(artifact())).not.toThrow();
  });

  it('rejects an artifact claiming to be another province', () => {
    expect(validate(artifact({ code: 'DN' }))).toThrow(/says it is DN/);
  });

  it('rejects an empty artifact', () => {
    expect(validate(artifact({ panos: [] }))).toThrow(/no panoramas/);
  });

  it('rejects malformed rows', () => {
    const bad = artifact();
    bad.panos[1] = { id: '', lat: 11.5, lng: 108.5, d: 0 };
    expect(validate(bad)).toThrow(/malformed id/);
    bad.panos[1] = { id: 'b', lat: NaN, lng: 108.5, d: 0 };
    expect(validate(bad)).toThrow(/bad coordinates/);
  });

  it('rejects duplicate ids', () => {
    const bad = artifact();
    bad.panos[1].id = 'a';
    expect(validate(bad)).toThrow(/duplicate id/);
  });

  it('rejects a panorama outside the province bbox', () => {
    const bad = artifact();
    bad.panos[1].lat = 13.0;
    expect(validate(bad)).toThrow(/outside the province bbox/);
  });

  it('rejects an out-of-range district offset', () => {
    const bad = artifact();
    bad.panos[1].d = 5;
    expect(validate(bad)).toThrow(/out-of-range district index/);
  });

  it('rejects mismatched partition counts', () => {
    expect(validate(artifact({ districtCounts: { DL: 1 } }))).toThrow(/do not add up/);
  });

  it('rejects unassigned panoramas', () => {
    // The schema tolerates NULL districts, but the pipeline always assigns, so
    // an unassigned point means the assign step was skipped.
    expect(validate(artifact({ unassigned: 1, districtCounts: { DL: 1 } }))).toThrow(
      /left unassigned/
    );
  });

  it('rejects a stranded rate or distance the partition cannot defend', () => {
    expect(validate(artifact({ stranded: 1 }))).toThrow(/stranded/);
    expect(validate(artifact({ worstStrandedKm: 2 }))).toThrow(/worst stranded placement/);
  });

  it('rejects districts that disagree with the region tree', () => {
    expect(validate(artifact({ districts: ['DL', 'GHOST'], districtCounts: { DL: 2, GHOST: 0 } })))
      .toThrow(/do not match the region tree/);
  });
});
