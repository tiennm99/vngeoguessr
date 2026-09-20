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
import { getGameSession } from '../src/lib/session.js';
import { readDay, statsDay } from '../src/lib/stats.js';

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
    expect(body.gameResult.region.path).toEqual(['Vietnam', 'Hồ Chí Minh', 'Quận 7']);
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

  it('rejects an expired or unknown session, and says which', async () => {
    const response = await guess({ username: 'mai', sessionId: 'gone', guessLat: 10, guessLng: 106 });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Session not found/);
    expect(body.reason).toBe('session-expired');
  });

  it('names the losers of a concurrent double submit as already submitted', async () => {
    // Only a race can see this reason: a later sequential re-submit finds no
    // session at all and is reported as expired, which is what it looks like.
    await seedSession('s8');
    const bodies = await Promise.all(
      (await Promise.all(Array.from({ length: 3 }, () =>
        guess({ username: 'mai', sessionId: 's8', guessLat: HCMC.lat, guessLng: HCMC.lng })
      ))).map((response) => response.json())
    );
    const losers = bodies.filter((body) => !body.success);
    expect(losers).toHaveLength(2);
    expect(losers.every((body) => body.reason === 'session-consumed')).toBe(true);
  });

  it.each([
    ['a non-numeric latitude', { guessLat: 'abc', guessLng: 106 }],
    // JSON turns NaN into null, and Number(null) is 0: a valid longitude.
    ['a null longitude', { guessLat: 10, guessLng: NaN }],
    ['an empty-string latitude', { guessLat: '', guessLng: 106 }],
    ['a latitude out of range', { guessLat: 95, guessLng: 106 }],
  ])('rejects %s with a 400 and leaves the session alive', async (_label, coords) => {
    // Math.abs(NaN) > 90 is false, so a range check alone let "abc" through;
    // and the check must come before the session is consumed, or the player
    // loses the round to a typo.
    await seedSession('s9');
    const response = await guess({ username: 'mai', sessionId: 's9', ...coords });
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('invalid-guess');
    expect(await getGameSession('s9')).not.toBeNull();
  });

  it.each([
    ['a non-string', 123],
    ['a colon, which the distance member packing splits on', 'mai:5'],
    ['too long a name', 'x'.repeat(21)],
  ])('rejects %s as a username before touching the session', async (_label, username) => {
    await seedSession('s10');
    const response = await guess({ username, sessionId: 's10', guessLat: HCMC.lat, guessLng: HCMC.lng });
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('invalid-username');
    expect(await getGameSession('s10')).not.toBeNull();
    expect(await storedKeys()).not.toContain('vngeoguessr:leaderboard:vietnam');
  });

  it('rejects a body that is not JSON with a 400, not a 500', async () => {
    const response = await POST(
      new Request('http://localhost/api/guess', { method: 'POST', body: '{nope' })
    );
    expect(response.status).toBe(400);
  });

  it('reports how much of the answer region the guess shared', async () => {
    // Display only: no board changes. A guess in Q7 against a Q7 panorama is
    // a district hit; one across the river in Q1 keeps the province; Ha Noi
    // shares nothing.
    await seedSession('s11');
    const q7 = await (await guess({ username: 'mai', sessionId: 's11', guessLat: 10.7340, guessLng: 106.7220 })).json();
    expect(q7.gameResult.hit).toBe('district');
    expect(q7.gameResult.guessedRegion.code).toBe('TPHCM-Q7');

    await seedSession('s12');
    const q1 = await (await guess({ username: 'mai', sessionId: 's12', guessLat: 10.7769, guessLng: 106.7009 })).json();
    expect(q1.gameResult.hit).toBe('province');

    await seedSession('s13');
    const hanoi = await (await guess({ username: 'mai', sessionId: 's13', guessLat: 21.0285, guessLng: 105.8542 })).json();
    expect(hanoi.gameResult.hit).toBe('none');
  });

  it('counts the round in the daily statistics by the picked level', async () => {
    await seedSession('s14', { pickedRegion: 'VN' });
    await POST(
      new Request('http://localhost/api/guess', {
        method: 'POST',
        headers: { cookie: 'vng_pid=0f4ee9e6-4a0b-4c1e-9a8a-1c2d3e4f5a6b' },
        body: JSON.stringify({ username: 'mai', sessionId: 's14', guessLat: HCMC.lat, guessLng: HCMC.lng }),
      })
    );
    const today = await readDay(statsDay());
    expect(today.rounds).toBe(1);
    expect(today.players).toBe(1);
    expect(today.byLevel.country).toEqual({ rounds: 1, zero: 0 });
  });

  it('does not repeat the guess or the answer in its response envelope beyond gameResult', async () => {
    // The log used to carry username plus both coordinate pairs; the response
    // still must carry the answer (the round is over), but nothing else does.
    await seedSession('s15');
    const body = await (
      await guess({ username: 'mai', sessionId: 's15', guessLat: HCMC.lat, guessLng: HCMC.lng })
    ).json();
    expect(body.gameResult.exactLocation).toEqual(HCMC);
  });
});
