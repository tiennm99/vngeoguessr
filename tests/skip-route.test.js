import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@upstash/redis', async (importOriginal) => {
  const { upstashModule } = await import('./mock-upstash.js');
  return upstashModule(importOriginal);
});

import { POST } from '../src/app/api/skip/route.js';
import { storeGameSession, getGameSession } from '../src/lib/session.js';
import { resetStore } from './redis-harness.js';

const ID = '0f4ee9e6-4a0b-4c1e-9a8a-1c2d3e4f5a6b';

function skip(body) {
  return POST(new Request('http://localhost/api/skip', { method: 'POST', body }));
}

describe('POST /api/skip', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('deletes the named session', async () => {
    await storeGameSession(ID, { sessionId: ID, exactLocation: { lat: 1, lng: 2 } });
    const response = await skip(JSON.stringify({ sessionId: ID }));
    expect(response.status).toBe(200);
    expect(await getGameSession(ID)).toBeNull();
  });

  it.each([
    ['a missing id', JSON.stringify({})],
    ['an id that is not a UUID', JSON.stringify({ sessionId: 'session:*' })],
    ['a body that is not JSON', '{nope'],
  ])('rejects %s with a 400', async (_label, body) => {
    // Anything but a server-minted id has nothing to delete and would
    // otherwise reach the keyspace as `session:<whatever was sent>`.
    expect((await skip(body)).status).toBe(400);
  });
});
