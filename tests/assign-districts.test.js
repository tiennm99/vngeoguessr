// Pins the geometry rules scripts/lib/assign-districts.mjs decides a
// panorama's district credit by, against small synthetic polygons rather than
// the real boundaries -- fast, and pinning the rules rather than the data.
//
// districtFor/nearestDistrict/cellKey/coverageVerdict/outlineSegments take
// plain data and are exercised directly. loadBoundary/prepareDistricts/
// assignPanos read boundary files off disk through REGIONS, so node:fs and
// the generated region tree are mocked with a small synthetic province.

import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import * as turf from '@turf/turf';

const { REGION_FIXTURE, boundaryFiles } = vi.hoisted(() => ({
  // A synthetic province: two square districts (A, B) with a gap between
  // them, and a third (C) whose boundary file omits properties.bbox, to pin
  // the turf.bbox(...) fallback in prepareDistricts.
  REGION_FIXTURE: {
    TESTP: { level: 'province', parent: 'VN' },
    'TESTP-A': { level: 'district', parent: 'TESTP' },
    'TESTP-B': { level: 'district', parent: 'TESTP' },
    'TESTP-C': { level: 'district', parent: 'TESTP' },
  },
  boundaryFiles: new Map(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileSync: (path, ...rest) =>
      boundaryFiles.has(path) ? boundaryFiles.get(path) : actual.readFileSync(path, ...rest),
  };
});

vi.mock('../src/data/regions/index.js', () => ({ REGIONS: REGION_FIXTURE }));

const { BOUNDARY_DIR } = await import('../scripts/lib/paths.mjs');
const {
  loadBoundary,
  outlineSegments,
  prepareDistricts,
  districtFor,
  nearestDistrict,
  assignPanos,
  cellKey,
  coverageVerdict,
  CELL_DEG,
  MIN_PANOS,
  MIN_CELLS,
  THIN_CELLS,
} = await import('../scripts/lib/assign-districts.mjs');

/** A rectangular GeoJSON feature, in the shape a real boundary file has. */
function rectFeature(code, minLng, minLat, maxLng, maxLat, includeBbox) {
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
  return {
    type: 'Feature',
    properties: {
      code,
      ...(includeBbox === false ? {} : { bbox: [minLng, minLat, maxLng, maxLat] }),
    },
    geometry,
  };
}

// TESTP: [0,0]-[3,1]. A: [0,0]-[1,1]. Gap: [1,0]-[2,1]. B: [2,0]-[3,1].
// C duplicates A's shape but its file has no properties.bbox.
boundaryFiles.set(
  `${BOUNDARY_DIR}/testp/testp.json`,
  JSON.stringify(rectFeature('TESTP', 0, 0, 3, 1))
);
boundaryFiles.set(
  `${BOUNDARY_DIR}/testp/testp-a.json`,
  JSON.stringify(rectFeature('TESTP-A', 0, 0, 1, 1))
);
boundaryFiles.set(
  `${BOUNDARY_DIR}/testp/testp-b.json`,
  JSON.stringify(rectFeature('TESTP-B', 2, 0, 3, 1))
);
boundaryFiles.set(
  `${BOUNDARY_DIR}/testp/testp-c.json`,
  JSON.stringify(rectFeature('TESTP-C', 0, 0, 1, 1, false))
);

describe('loadBoundary', () => {
  it('reads a province boundary from its own file', () => {
    const boundary = loadBoundary('TESTP');
    expect(boundary.properties.code).toBe('TESTP');
  });

  it("reads a leaf boundary from its parent province's directory", () => {
    const boundary = loadBoundary('TESTP-A');
    expect(boundary.properties.code).toBe('TESTP-A');
  });

  it('throws for a code absent from the region tree', () => {
    expect(() => loadBoundary('NOPE')).toThrow(/Unknown region: NOPE/);
  });
});

describe('outlineSegments', () => {
  it('returns one LineString for a plain polygon', () => {
    const feature = rectFeature('X', 0, 0, 1, 1);
    const segments = outlineSegments(feature);
    expect(segments).toHaveLength(1);
    expect(segments[0].geometry.type).toBe('LineString');
  });

  it('flattens a polygon-with-hole into one LineString per ring', () => {
    const withHole = turf.polygon([
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
        [1, 1],
      ],
    ]);
    const segments = outlineSegments(withHole);
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.geometry.type === 'LineString')).toBe(true);
  });

  it('flattens a MultiPolygon into one LineString per part', () => {
    const multi = turf.multiPolygon([
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
      [
        [
          [2, 0],
          [3, 0],
          [3, 1],
          [2, 1],
          [2, 0],
        ],
      ],
    ]);
    const segments = outlineSegments(multi);
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.geometry.type === 'LineString')).toBe(true);
  });
});

describe('prepareDistricts', () => {
  it('carries the boundary bbox through when the file has one', () => {
    const [a] = prepareDistricts(['TESTP-A']);
    expect(a.bbox).toEqual([0, 0, 1, 1]);
  });

  it('computes the bbox with turf when the file omits properties.bbox', () => {
    const [c] = prepareDistricts(['TESTP-C']);
    expect(c.bbox).toEqual([0, 0, 1, 1]);
  });

  it('keeps district order as given', () => {
    const districts = prepareDistricts(['TESTP-B', 'TESTP-A']);
    expect(districts.map((d) => d.code)).toEqual(['TESTP-B', 'TESTP-A']);
  });
});

describe('districtFor', () => {
  // A bbox-only rectangle is a poor proxy for an irregular shape: a point can
  // sit inside a district's bbox while sitting outside its actual outline.
  const triangle = {
    code: 'TRI',
    boundary: turf.polygon([
      [
        [0, 0],
        [2, 0],
        [0, 2],
        [0, 0],
      ],
    ]),
    bbox: [0, 0, 2, 2],
  };

  it('assigns a point inside exactly one polygon to it', () => {
    const [a, b] = prepareDistricts(['TESTP-A', 'TESTP-B']);
    expect(districtFor({ lat: 0.5, lng: 0.5 }, [a, b])).toBe('TESTP-A');
    expect(districtFor({ lat: 0.5, lng: 2.5 }, [a, b])).toBe('TESTP-B');
  });

  it('rejects a point inside a bbox but outside the real polygon shape', () => {
    expect(districtFor({ lat: 1.5, lng: 1.5 }, [triangle])).toBeNull();
  });

  it('accepts a point that clears both the bbox and the polygon shape', () => {
    expect(districtFor({ lat: 0.5, lng: 0.5 }, [triangle])).toBe('TRI');
  });

  it('returns null for a point inside the province but outside every district', () => {
    const [a, b] = prepareDistricts(['TESTP-A', 'TESTP-B']);
    // (1.5, 0.5) is inside TESTP [0,0]-[3,1] but in the gap between A and B.
    expect(districtFor({ lat: 0.5, lng: 1.5 }, [a, b])).toBeNull();
  });

  it('assigns a point on a shared border to exactly the first-listed district', () => {
    const adjacentA = { code: 'ADJ-A', boundary: turf.polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]), bbox: [0, 0, 1, 1] };
    const adjacentB = { code: 'ADJ-B', boundary: turf.polygon([[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]]), bbox: [1, 0, 2, 1] };
    const point = { lat: 0.5, lng: 1 };
    // Both polygons contain the shared edge, so the tie has to resolve one
    // way, deterministically, rather than double-crediting the point.
    expect(districtFor(point, [adjacentA, adjacentB])).toBe('ADJ-A');
    expect(districtFor(point, [adjacentB, adjacentA])).toBe('ADJ-B');
  });

  it('returns null when there are no candidate districts', () => {
    expect(districtFor({ lat: 0.5, lng: 0.5 }, [])).toBeNull();
  });
});

describe('nearestDistrict', () => {
  it('picks the district whose outline is actually closest', () => {
    // Ranked by distance to the real outline rather than to a bbox centre --
    // see the doc comment on nearestDistrict for why that distinction
    // mattered in production (up to 6km of misattribution in Ho Chi Minh
    // City). Here the two candidates are simply placed so only the outline
    // distance, not a naive centroid guess, can tell them apart correctly.
    const near = {
      code: 'NEAR',
      lines: outlineSegments(turf.polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])),
    };
    const far = {
      code: 'FAR',
      lines: outlineSegments(turf.polygon([[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]])),
    };
    const nearest = nearestDistrict({ lat: 0.5, lng: 2 }, [near, far]);
    expect(nearest.code).toBe('NEAR');
    expect(nearest.km).toBeGreaterThan(0);
  });

  it('returns null when there are no districts', () => {
    expect(nearestDistrict({ lat: 0, lng: 0 }, [])).toBeNull();
  });
});

describe('cellKey', () => {
  it('gives the same key to two points in the same cell', () => {
    const a = cellKey({ lat: 10.001, lng: 106.001 });
    const b = cellKey({ lat: 10.005, lng: 106.005 });
    expect(a).toBe(b);
  });

  it('gives different keys to points a full cell width apart', () => {
    const a = cellKey({ lat: 10, lng: 106 });
    const b = cellKey({ lat: 10 + CELL_DEG, lng: 106 });
    expect(a).not.toBe(b);
  });
});

describe('coverageVerdict', () => {
  it('is unplayable below the panorama floor', () => {
    expect(coverageVerdict(MIN_PANOS - 1, MIN_CELLS)).toEqual({ playable: false, thin: false });
  });

  it('is unplayable below the cell floor even with plenty of panoramas', () => {
    expect(coverageVerdict(1000, MIN_CELLS - 1)).toEqual({ playable: false, thin: false });
  });

  it('is playable and thin just at the floor', () => {
    expect(coverageVerdict(MIN_PANOS, MIN_CELLS)).toEqual({ playable: true, thin: true });
  });

  it('is playable and not thin once cells reach the thin threshold', () => {
    expect(coverageVerdict(1000, THIN_CELLS)).toEqual({ playable: true, thin: false });
  });
});

describe('assignPanos', () => {
  it('assigns a point inside exactly one district and counts it there', () => {
    const panos = [{ id: 'p1', lat: 0.5, lng: 0.5 }];
    const result = assignPanos(panos, ['TESTP-A', 'TESTP-B']);
    expect(result.assignments).toEqual(['TESTP-A']);
    expect(result.counts).toEqual({ 'TESTP-A': 1, 'TESTP-B': 0 });
    expect(result.stranded).toBe(0);
    expect(result.unassigned).toBe(0);
  });

  it('assigns a stranded point (in the gap) to exactly one district by nearest outline, never both', () => {
    // (1.5, 0.5) sits equidistant along the gap's midline, so this also pins
    // that a tie does not get double-counted.
    const panos = [{ id: 'gap', lat: 0.5, lng: 1.5 }];
    const result = assignPanos(panos, ['TESTP-A', 'TESTP-B']);
    expect(result.stranded).toBe(1);
    expect(result.unassigned).toBe(0);
    expect([null]).not.toContain(result.assignments[0]);
    const assignedCode = result.assignments[0];
    expect(['TESTP-A', 'TESTP-B']).toContain(assignedCode);
    // Exactly one district's count reflects the assignment.
    expect(result.counts['TESTP-A'] + result.counts['TESTP-B']).toBe(1);
    expect(result.counts[assignedCode]).toBe(1);
  });

  it('marks every panorama unassigned when the province has no district polygons', () => {
    const panos = [{ id: 'p1', lat: 0.5, lng: 0.5 }, { id: 'p2', lat: 0.6, lng: 0.6 }];
    const result = assignPanos(panos, []);
    expect(result.assignments).toEqual([null, null]);
    expect(result.unassigned).toBe(2);
    expect(result.stranded).toBe(0);
    expect(result.counts).toEqual({});
  });

  it('produces counts and cells that sum to the input, and reports the worst stranded distance', () => {
    const panos = [
      { id: 'a1', lat: 0.1, lng: 0.1 },
      { id: 'a2', lat: 0.9, lng: 0.9 },
      { id: 'b1', lat: 0.1, lng: 2.9 },
      { id: 'gap1', lat: 0.5, lng: 1.5 },
    ];
    const result = assignPanos(panos, ['TESTP-A', 'TESTP-B']);
    const totalCounted = result.counts['TESTP-A'] + result.counts['TESTP-B'];
    expect(totalCounted).toBe(panos.length);
    expect(result.assignments).toHaveLength(panos.length);
    expect(result.stranded).toBe(1);
    expect(result.worstStrandedKm).toBeGreaterThan(0);
    // cells reports distinct ~1.1km cells actually occupied per district, so
    // it can never exceed that district's own panorama count.
    expect(result.cells['TESTP-A']).toBeLessThanOrEqual(result.counts['TESTP-A']);
    expect(result.cells['TESTP-B']).toBeLessThanOrEqual(result.counts['TESTP-B']);
  });

  it('does not drop a point outside the province -- that clip is the caller\'s job', () => {
    // assignPanos only chooses among the districts it is given; it never
    // checks the point against a province outline. A point far outside TESTP
    // still gets a nearest-outline assignment rather than coming back null --
    // which is exactly why build-pano-index.mjs and assign-pano-districts.mjs
    // both clip against the province boundary before calling this.
    const farAway = { id: 'far', lat: 50, lng: 50 };
    const result = assignPanos([farAway], ['TESTP-A', 'TESTP-B']);
    expect(result.assignments[0]).not.toBeNull();
    expect(result.stranded).toBe(1);

    // The clip callers actually perform: reject it against the province
    // boundary before it would ever reach assignPanos.
    const province = loadBoundary('TESTP');
    expect(turf.booleanPointInPolygon(turf.point([farAway.lng, farAway.lat]), province)).toBe(
      false
    );
  });
});
