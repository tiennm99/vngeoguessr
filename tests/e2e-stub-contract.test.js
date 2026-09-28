import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});
vi.mock('@neondatabase/serverless', async () => {
  const { neonModule } = await import('./mock-neon.js');
  return neonModule();
});

import { GET as newGame } from '../src/app/api/new-game/route.js';
import { POST as submitGuess } from '../src/app/api/guess/route.js';
import { GET as daily } from '../src/app/api/daily/route.js';
import { GET as leaderboard } from '../src/app/api/leaderboard/route.js';
import { getGameSession } from '../src/lib/session.js';
import { resetStore } from './redis-harness.js';
import { seedPanoFixtures } from './pano-fixtures.js';
import { stubMapillary } from './mapillary-stub.js';
import { newGameResponse, guessResponse, dailyResponse, leaderboardResponse } from './e2e/helpers.js';

// The Playwright specs never reach the route handlers: tests/e2e/helpers.js
// answers every request with hand-written payloads. Those drift. A field the
// client started reading (`hit`, `partial`) rendered in zero e2e runs until
// this test, which asserts each stub carries every key the real route emits.

stubMapillary();

beforeAll(async () => {
  await seedPanoFixtures(false);
});

beforeEach(async () => {
  await resetStore();
});

/** Every key path in an object, dotted, arrays looked into by their first element. */
function keyPaths(value, prefix = '') {
  if (Array.isArray(value)) return value.length ? keyPaths(value[0], `${prefix}[]`) : [prefix];
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.keys(value).flatMap((key) => keyPaths(value[key], prefix ? `${prefix}.${key}` : key));
}

function expectSuperset(stub, real) {
  const missing = keyPaths(real).filter((path) => !keyPaths(stub).includes(path));
  expect(missing, 'keys the real route emits but the e2e stub lacks').toEqual([]);
}

/** One real round, guessed on the spot, returning the /api/guess body. */
async function playRound() {
  const created = await (await newGame(new Request('http://localhost/api/new-game?region=TPHCM'))).json();
  const session = await getGameSession(created.sessionId);
  const response = await submitGuess(
    new Request('http://localhost/api/guess', {
      method: 'POST',
      body: JSON.stringify({
        username: 'mai',
        sessionId: created.sessionId,
        guessLat: session.exactLocation.lat,
        guessLng: session.exactLocation.lng,
      }),
    })
  );
  return response.json();
}

describe('e2e stubs mirror the real routes', () => {
  it('/api/new-game', async () => {
    const real = await (await newGame(new Request('http://localhost/api/new-game?region=TPHCM'))).json();
    expectSuperset(newGameResponse('s', 1), real);
  });

  it('/api/guess', async () => {
    expectSuperset(guessResponse('mai'), await playRound());
  });

  it('/api/daily', async () => {
    const real = await (await daily(new Request('http://localhost/api/daily'))).json();
    expectSuperset(dailyResponse('s'), real);
  });

  it('/api/leaderboard', async () => {
    // Scored first, so the board has a real row to compare the stub's with.
    await playRound();
    const real = await (await leaderboard(new Request('http://localhost/api/leaderboard?region=VN'))).json();
    expect(real.leaderboard.length).toBeGreaterThan(0);
    expectSuperset(leaderboardResponse(), real);
  });
});
