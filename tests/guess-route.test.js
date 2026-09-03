import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import { POST } from '../src/app/api/guess/route.js';
import { storeGameSession } from '../src/lib/session.js';
import { getLeaderboard } from '../src/lib/leaderboard.js';
import { calculateDistance, calculateScore } from '../src/lib/game.js';
import { resetStore, storedKeys } from './redis-harness.js';

// Scoring reads the region from the session and nowhere else. This is the
// property the whole design rests on: a client that could name its own region
// could farm any district's board from a single round.

const HCMC = { lat: 10.7712, lng: 106.7003 };

/** Put a playable session in the store. */
async function seedSession(sessionId, overrides) {
  await storeGameSession(sessionId, {
    sessionId,
    pickedRegion: 'TPHCM',
    regionCode: 'TPHCM-Q7',
    exactLocation: HCMC,
    imageId: '123',
    createdAt: Date.now(),
    ...overrides,
  });
}

/** Submit a guess. */
function guess(body) {
  return POST(
    new Request('http://localhost/api/guess', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/guess', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('credits the district on the session, its province and the country', async () => {
    await seedSession('s1');
    const body = await (
      await guess({ username: 'mai', sessionId: 's1', guessLat: HCMC.lat, guessLng: HCMC.lng })
    ).json();

    expect(body.success).toBe(true);
    expect(body.gameResult.levels.map((l) => l.code)).toEqual(['TPHCM-Q7', 'TPHCM', 'VN']);

    const keys = await storedKeys();
    expect(keys).toContain('vngeoguessr:leaderboard:city:tphcm-q7');
    expect(keys).toContain('vngeoguessr:leaderboard:city:tphcm');
    expect(keys).toContain('vngeoguessr:leaderboard:vietnam');
  });

  it('ignores a region supplied in the request body', async () => {
    // The anti-cheat property. A client naming DL must not move DL's board.
    await seedSession('s2');
    await guess({
      username: 'mai',
      sessionId: 's2',
      guessLat: HCMC.lat,
      guessLng: HCMC.lng,
      regionCode: 'DL',
      cityCode: 'DL',
    });

    expect(await storedKeys()).not.toContain('vngeoguessr:leaderboard:city:dl');
    expect((await getLeaderboard('TPHCM-Q7')).length).toBe(1);
  });

  it('reveals where the panorama was, but only in the result', async () => {
    await seedSession('s3');
    const body = await (
      await guess({ username: 'mai', sessionId: 's3', guessLat: HCMC.lat, guessLng: HCMC.lng })
    ).json();
    expect(body.gameResult.region.path).toEqual(['Vietnam', 'Ho Chi Minh', 'District 7']);
  });

  it('cannot be replayed for double credit', async () => {
    // The session is consumed before the writes, so a retry finds nothing. A
    // live session would let a mid-fan-out failure be re-submitted and credit
    // every level that already succeeded a second time.
    await seedSession('s4');
    const first = await guess({
      username: 'mai', sessionId: 's4', guessLat: HCMC.lat, guessLng: HCMC.lng,
    });
    expect((await first.json()).success).toBe(true);

    const replay = await guess({
      username: 'mai', sessionId: 's4', guessLat: HCMC.lat, guessLng: HCMC.lng,
    });
    expect((await replay.json()).success).toBe(false);

    // The score landed exactly once.
    expect((await getLeaderboard('TPHCM-Q7'))[0].score).toBe(5);
  });

  it('lets exactly one of many concurrent submits score', async () => {
    // Read-then-delete is not a guard: ten requests all read a live session,
    // all delete it, and all write. DEL is atomic, so gating on its count is
    // what actually makes consumption exclusive.
    await seedSession('s6');
    const submissions = Array.from({ length: 10 }, () =>
      guess({ username: 'mai', sessionId: 's6', guessLat: HCMC.lat, guessLng: HCMC.lng })
    );
    const bodies = await Promise.all(
      (await Promise.all(submissions)).map((response) => response.json())
    );

    expect(bodies.filter((body) => body.success)).toHaveLength(1);

    // And the score landed once, not ten times.
    expect((await getLeaderboard('TPHCM-Q7'))[0].score).toBe(5);
    expect((await getLeaderboard('VN'))[0].score).toBe(5);
    // One distance record, not ten: the entry id embeds a timestamp, so
    // duplicates would each take their own slot on a 200-entry board.
    expect(await getLeaderboard('TPHCM-Q7', 100, 'distance')).toHaveLength(1);
  });

  it('scores every level on the one ladder, whatever region was picked', async () => {
    // The session was created for a province round, but the picked region no
    // longer bends the ladder: 2.2km is a zero everywhere, on every board.
    await seedSession('s7');
    const guessLat = HCMC.lat + 0.02; // roughly 2.2km north
    const body = await (
      await guess({ username: 'mai', sessionId: 's7', guessLat, guessLng: HCMC.lng })
    ).json();

    const distance = calculateDistance(guessLat, HCMC.lng, HCMC.lat, HCMC.lng);
    const points = calculateScore(distance);
    expect(points).toBe(0);
    expect(body.gameResult.score).toBe(points);
    expect(body.gameResult.levels.map((level) => level.points)).toEqual([
      points,
      points,
      points,
    ]);
    expect((await getLeaderboard('VN'))[0].score).toBe(points);
    expect((await getLeaderboard('TPHCM-Q7'))[0].score).toBe(points);
  });

  it('rejects an expired or unknown session', async () => {
    const body = await (
      await guess({ username: 'mai', sessionId: 'gone', guessLat: 10, guessLng: 106 })
    ).json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Session not found/);
  });
});
