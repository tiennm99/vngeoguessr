import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

// Two failure injections, both after the session has been consumed, which is
// the point of no return: a level's ZINCRBY throwing, and the statistics store
// throwing. Neither may turn a scored round into "nothing was scored".
const failingKeys = new Set();
vi.mock('../src/lib/upstash.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    zIncrBy: async (h, key, increment, member) => {
      if (failingKeys.has(key)) throw new Error(`injected failure on ${key}`);
      return actual.zIncrBy(h, key, increment, member);
    },
  };
});

let statsDown = false;
vi.mock('../src/lib/stats.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    recordRound: async (...args) => {
      if (statsDown) throw new Error('injected stats outage');
      return actual.recordRound(...args);
    },
  };
});

import { POST } from '../src/app/api/guess/route.js';
import { storeGameSession, getGameSession } from '../src/lib/session.js';
import { getLeaderboard } from '../src/lib/leaderboard.js';
import { resetStore } from './redis-harness.js';

const HCMC = { lat: 10.7712, lng: 106.7003 };

async function seedSession(sessionId) {
  await storeGameSession(sessionId, {
    sessionId,
    pickedRegion: 'TPHCM',
    regionCode: 'TPHCM-Q7',
    exactLocation: HCMC,
    imageId: '123',
    createdAt: Date.now(),
  });
}

function guess(sessionId) {
  return POST(
    new Request('http://localhost/api/guess', {
      method: 'POST',
      body: JSON.stringify({ username: 'mai', sessionId, guessLat: HCMC.lat, guessLng: HCMC.lng }),
    })
  );
}

describe('POST /api/guess after the session is consumed', () => {
  beforeEach(async () => {
    await resetStore();
    failingKeys.clear();
    statsDown = false;
  });

  it('reports the levels that landed when one level fails to write', async () => {
    failingKeys.add('leaderboard:vietnam');
    await seedSession('p1');
    const response = await guess('p1');
    const body = await response.json();

    // The round scored on two boards; saying "nothing was scored" would be
    // false, and the session is gone so there is nothing to retry.
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.gameResult.partial).toBe(true);
    expect(body.gameResult.levels.map((l) => l.code).sort()).toEqual(['TPHCM', 'TPHCM-Q7']);
    expect((await getLeaderboard('TPHCM-Q7'))[0].score).toBe(5);
    expect(await getLeaderboard('VN')).toEqual([]);
    expect(await getGameSession('p1')).toBeNull();
  });

  it('fails the round only when no level could be written', async () => {
    for (const key of ['leaderboard:city:tphcm-q7', 'leaderboard:city:tphcm', 'leaderboard:vietnam']) {
      failingKeys.add(key);
    }
    await seedSession('p2');
    const response = await guess('p2');
    expect(response.status).toBe(500);
    expect((await response.json()).success).toBe(false);
  });

  it('scores the round when the statistics store is down', async () => {
    statsDown = true;
    await seedSession('p3');
    const body = await (await guess('p3')).json();
    expect(body.success).toBe(true);
    expect(body.gameResult.partial).toBe(false);
    expect((await getLeaderboard('VN'))[0].score).toBe(5);
  });
});
