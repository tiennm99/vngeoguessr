import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import {
  getLeaderboard,
  submitRoundScore,
  submitDistanceRecord,
} from '../src/lib/leaderboard.js';
import { SCORE_BANDS } from '../src/lib/game.js';
import { resetStore, storedKeys } from './redis-harness.js';

const MAX_LEADERBOARD_SIZE = 200;

/**
 * A distance that scores exactly `points` on the ladder, so a test can award
 * a known point value through the one write path production uses.
 */
function distanceFor(points) {
  if (points === 0) return SCORE_BANDS[SCORE_BANDS.length - 1].maxMeters + 1;
  const band = SCORE_BANDS.find((b) => b.points === points);
  const index = SCORE_BANDS.indexOf(band);
  return index === 0 ? 0 : SCORE_BANDS[index - 1].maxMeters + 1;
}

/** Credit `points` to a region and everything above it. */
function award(username, points, regionCode) {
  return submitRoundScore(username, distanceFor(points), regionCode);
}

/** Reach an exact total through rounds of at most five points. */
async function awardTotal(username, total, regionCode) {
  let left = total;
  let last = null;
  while (left > 0) {
    const points = Math.min(5, left);
    last = await award(username, points, regionCode);
    left -= points;
  }
  return last;
}

/** The level entry for one region code out of a fan-out result. */
function at(result, code) {
  return result.levels.find((level) => level.code === code) ?? null;
}

describe('score leaderboard', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('accumulates repeat submissions rather than replacing them', async () => {
    await award('mai', 3, 'TPHCM');
    const second = await award('mai', 4, 'TPHCM');
    expect(at(second, 'VN').score).toBe(7);
    expect(at(second, 'TPHCM').score).toBe(7);
  });

  it('keeps city totals independent of each other', async () => {
    await award('mai', 5, 'TPHCM');
    const inHanoi = await award('mai', 2, 'HN');
    expect(at(inHanoi, 'HN').score).toBe(2);
    // The global total spans both cities.
    expect(at(inHanoi, 'VN').score).toBe(7);
  });

  it('lowercases the city key', async () => {
    await award('mai', 1, 'TPHCM');
    expect(await storedKeys()).toContain('vngeoguessr:leaderboard:city:tphcm');
  });

  it('ranks the highest total first, counting from one', async () => {
    await award('anh', 2, 'HN');
    await award('binh', 5, 'HN');
    const chi = await award('chi', 4, 'HN');
    expect(at(chi, 'HN').rank).toBe(2);

    const leaderboard = await getLeaderboard('HN', 10, 'score');
    expect(leaderboard).toEqual([
      { username: 'binh', score: 5, rank: 1 },
      { username: 'chi', score: 4, rank: 2 },
      { username: 'anh', score: 2, rank: 3 },
    ]);
  });

  it('moves a player up as their total grows', async () => {
    await award('anh', 5, 'HN');
    await award('binh', 3, 'HN');
    expect(at(await award('binh', 4, 'HN'), 'HN').rank).toBe(1);
  });

  it('honours the requested limit', async () => {
    for (const name of ['anh', 'binh', 'chi', 'dung']) {
      await award(name, 1, 'HN');
    }
    expect(await getLeaderboard('HN', 2, 'score')).toHaveLength(2);
  });

  it('returns an empty leaderboard before anyone plays', async () => {
    expect(await getLeaderboard('HN', 10, 'score')).toEqual([]);
  });

  it("keeps every player's total and serves at most the top window", async () => {
    // Score boards are never trimmed. Trimming used to delete the total of
    // anyone outside the top 200, so their next round restarted from zero and
    // once 200th place held more than one round's points the board was closed
    // to new players for good.
    const overflow = MAX_LEADERBOARD_SIZE + 5;
    for (let i = 0; i < overflow; i++) {
      await awardTotal(`player${String(i).padStart(3, '0')}`, i + 1, 'HN');
    }

    // The weakest player is still on the board with their total intact, and
    // ranked below the window rather than forgotten.
    const weakest = await award('player000', 1, 'HN');
    expect(at(weakest, 'HN').score).toBe(2);
    expect(at(weakest, 'HN').rank).toBe(overflow);

    for (const scope of ['HN', null]) {
      const served = await getLeaderboard(scope, overflow, 'score');
      expect(served).toHaveLength(MAX_LEADERBOARD_SIZE);
      expect(served[0].username).toBe(`player${String(overflow - 1).padStart(3, '0')}`);
    }
  });

  it('adds concurrent rounds under one name without losing any', async () => {
    // A read-then-write here lost increments when two rounds finished together.
    await Promise.all(Array.from({ length: 10 }, () => award('mai', 1, 'HN')));
    expect((await getLeaderboard('HN', 1, 'score'))[0].score).toBe(10);
  });

  it.each([
    ['username', ['', 100, 'HN']],
    ['regionCode', ['mai', 100, '']],
  ])('rejects a submission missing %s', async (_field, args) => {
    await expect(submitRoundScore(...args)).rejects.toThrow(/Missing required fields/);
  });

  it('trims surrounding whitespace from the username', async () => {
    const result = await award('  mai  ', 3, 'HN');
    expect(at(result, 'VN').username).toBe('mai');
    expect((await getLeaderboard('HN', 10, 'score'))[0].username).toBe('mai');
  });
});

describe('distance leaderboard', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('ranks the shortest distance first', async () => {
    await submitDistanceRecord('anh', 900, 'DL');
    await submitDistanceRecord('binh', 120, 'DL');
    const chi = await submitDistanceRecord('chi', 400, 'DL');
    expect(at(chi, 'DL').rank).toBe(2);

    const leaderboard = await getLeaderboard('DL', 10, 'distance');
    expect(leaderboard.map((e) => [e.username, e.distance])).toEqual([
      ['binh', 120],
      ['chi', 400],
      ['anh', 900],
    ]);
    expect(leaderboard.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('keeps every attempt instead of overwriting the previous one', async () => {
    // Unlike scores, each distance attempt gets its own slot, so a player can
    // hold several rows.
    await submitDistanceRecord('mai', 500, 'DL');
    await submitDistanceRecord('mai', 80, 'DL');
    const leaderboard = await getLeaderboard('DL', 10, 'distance');
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard.map((e) => e.distance)).toEqual([80, 500]);
  });

  it('decodes the username, distance and timestamp from the entry id', async () => {
    const before = Date.now();
    await submitDistanceRecord('mai', 250, 'DL');
    const [entry] = await getLeaderboard('DL', 10, 'distance');
    expect(entry.username).toBe('mai');
    expect(entry.distance).toBe(250);
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('writes to both the city and the global key', async () => {
    await submitDistanceRecord('mai', 250, 'DL');
    const keys = await storedKeys();
    expect(keys).toContain('vngeoguessr:distance:city:dl');
    expect(keys).toContain('vngeoguessr:distance:vietnam');
    expect(await getLeaderboard(null, 10, 'distance')).toHaveLength(1);
  });

  it('keeps only the closest entries once the cap is passed', async () => {
    const overflow = MAX_LEADERBOARD_SIZE + 5;
    for (let i = 0; i < overflow; i++) {
      await submitDistanceRecord('mai', (i + 1) * 10, 'DL');
    }

    const all = await getLeaderboard('DL', overflow, 'distance');
    expect(all).toHaveLength(MAX_LEADERBOARD_SIZE);
    expect(all[0].distance).toBe(10);
    // The furthest five attempts are the ones dropped.
    expect(all[all.length - 1].distance).toBe(MAX_LEADERBOARD_SIZE * 10);
  });

  it.each([
    ['username', ['', 100, 'DL']],
    ['cityCode', ['mai', 100, '']],
  ])('rejects a submission missing %s', async (_field, args) => {
    await expect(submitDistanceRecord(...args)).rejects.toThrow(/Missing required fields/);
  });
});

describe('global leaderboard', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('spans every city', async () => {
    await award('anh', 5, 'HN');
    await award('binh', 3, 'TPHCM');
    const global = await getLeaderboard(null, 10, 'score');
    expect(global.map((e) => e.username)).toEqual(['anh', 'binh']);
  });

  it('defaults to the score leaderboard', async () => {
    await award('anh', 5, 'HN');
    expect(await getLeaderboard()).toEqual([{ username: 'anh', score: 5, rank: 1 }]);
  });
});

describe('fan-out up the region tree', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('credits the district, its province and the country by the same amount', async () => {
    const result = await award('mai', 3, 'TPHCM-Q7');
    expect(result.levels.map((l) => l.code)).toEqual(['TPHCM-Q7', 'TPHCM', 'VN']);
    for (const level of result.levels) expect(level.score).toBe(3);

    const keys = await storedKeys();
    expect(keys).toContain('vngeoguessr:leaderboard:city:tphcm-q7');
    expect(keys).toContain('vngeoguessr:leaderboard:city:tphcm');
    expect(keys).toContain('vngeoguessr:leaderboard:vietnam');
  });

  it('rolls a second district into the same province and country totals', async () => {
    await award('mai', 3, 'TPHCM-Q7');
    const second = await award('mai', 2, 'TPHCM-Q1');

    expect(at(second, 'TPHCM-Q1').score).toBe(2); // Q1 alone
    expect(at(second, 'TPHCM').score).toBe(5); // Q7 + Q1
    expect(at(second, 'VN').score).toBe(5);
  });

  it('keeps Da Lat under Lam Dong', async () => {
    // Pre-2025 units: Duc Hoa belongs to Long An, not the Tay Ninh it merged
    // into. Both leaf codes stay bare so their history stays attached.
    const daLat = await award('mai', 4, 'DL');
    expect(daLat.levels.map((l) => l.code)).toEqual(['DL', 'LD', 'VN']);

    const ducHoa = await award('mai', 1, 'DH');
    expect(ducHoa.levels.map((l) => l.code)).toEqual(['DH', 'LA', 'VN']);
    expect(at(ducHoa, 'VN').score).toBe(5);
  });

  it('credits two levels when the panorama sat outside every district', async () => {
    // A province-level code is a legitimate scoring target: the panorama fell
    // in a gap between simplified district outlines.
    const result = await award('mai', 2, 'DN');
    expect(result.levels.map((l) => l.code)).toEqual(['DN', 'VN']);
    expect(at(result, 'DN').score).toBe(2);
  });

  it('maps the country to the pre-existing global key', async () => {
    // Not leaderboard:city:vn -- the national board players already have has to
    // keep accumulating rather than restarting under a new name.
    await award('mai', 1, 'DL');
    const keys = await storedKeys();
    expect(keys).toContain('vngeoguessr:leaderboard:vietnam');
    expect(keys).not.toContain('vngeoguessr:leaderboard:city:vn');
  });

  it('scores a round at the same points on every level', async () => {
    // 2.2km off is past the 1km floor, so it is a zero on the district board
    // and equally a zero above it: no board pays more for a wider region.
    const result = await submitRoundScore('mai', 2200, 'TPHCM-Q7');

    expect(result.levels.map((l) => [l.code, l.points])).toEqual([
      ['TPHCM-Q7', 0],
      ['TPHCM', 0],
      ['VN', 0],
    ]);
    expect(result.partial).toBe(false);
    expect((await getLeaderboard('VN'))[0].score).toBe(0);
    expect((await getLeaderboard('TPHCM-Q7'))[0].score).toBe(0);
  });

  it('scores a perfect round at full points on every level', async () => {
    const result = await submitRoundScore('mai', 0, 'TPHCM-Q7');
    expect(result.levels.map((l) => l.points)).toEqual([5, 5, 5]);
  });

  it.each([null, '', 'abc', -1, Infinity])(
    'rejects %j as a distance instead of paying full points for it',
    async (distance) => {
      // Number(null) and Number('') are 0, and 0 metres is a maximum-score
      // fan-out -- absent input must throw, not top every board.
      await expect(submitRoundScore('mai', distance, 'TPHCM-Q7')).rejects.toThrow(
        /Missing required fields|Invalid distance/
      );
    }
  );

  it('fans distance records out with one shared id', async () => {
    const result = await submitDistanceRecord('mai', 250, 'TPHCM-Q7');
    expect(result.levels.map((l) => l.code)).toEqual(['TPHCM-Q7', 'TPHCM', 'VN']);

    // The same attempt should be recognisable as one record at every level.
    const district = await getLeaderboard('TPHCM-Q7', 10, 'distance');
    const country = await getLeaderboard('VN', 10, 'distance');
    expect(district[0].timestamp).toBe(country[0].timestamp);
    expect(district[0].distance).toBe(250);
  });
});

describe('region validation', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it.each([
    ['submitRoundScore', () => submitRoundScore('mai', 100, 'NOPE')],
    ['submitDistanceRecord', () => submitDistanceRecord('mai', 100, 'NOPE')],
    ['getLeaderboard', () => getLeaderboard('NOPE')],
  ])('%s rejects an unknown region', async (_name, call) => {
    // Validated in the library, not only in the route: the migration script and
    // any future caller bypass routes entirely, and the key builder lowercases
    // whatever it is handed straight into a Redis key.
    await expect(call()).rejects.toThrow(/Unknown region/);
  });

  it('creates no key for a rejected region', async () => {
    await expect(submitRoundScore('mai', 100, 'NOPE')).rejects.toThrow();
    expect(await storedKeys()).toEqual([]);
  });

  it.each([
    // 0 and NaN are falsy, so they take the default of 100 -- the same
    // behaviour as the `parseInt(...) || 100` this replaced.
    [-1, 1],
    [0, 100],
    [NaN, 100],
    [99999, 200],
    [Infinity, 200],
    ['50', 50],
  ])('clamps a limit of %s to %i rows', async (limit, expected) => {
    // Seeded past the cap so each clamp lands on a distinguishable length. A
    // board with one entry cannot tell a working clamp from a missing one.
    for (let i = 0; i < 250; i++) await award(`p${i}`, (i % 5) + 1, 'DL');
    expect((await getLeaderboard('DL', limit, 'score')).length).toBe(expected);
  });

  it('treats a null region as the country', async () => {
    await award('mai', 3, 'DL');
    expect(await getLeaderboard(null)).toEqual(await getLeaderboard('VN'));
  });
});
