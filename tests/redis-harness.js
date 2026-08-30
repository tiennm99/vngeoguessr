// Lets one set of tests run against either backing store.
//
// By default the suite mocks @upstash/redis with the in-memory fake, so it
// needs no service at all. With TEST_REDIS=real the mock steps aside and the
// real SDK talks to SRH, which serves the Upstash REST API on top of a real
// Redis (see docker-compose.yml). Running the same assertions both ways is what
// keeps the fake honest.
//
// Test bodies must go through this module rather than reaching into the fake's
// internals, or they only work in one mode.

import { getUpstash } from '../src/lib/upstash.js';
import { FakeRedis } from './fake-upstash-redis.js';

export const isFake = process.env.TEST_REDIS !== 'real';

/** Skip helper for assertions that only make sense against the fake. */
export const fakeOnly = { skip: !isFake };

/** Empty the store so each test starts from nothing. */
export async function resetStore() {
  if (isFake) {
    FakeRedis.resetAll();
    return;
  }
  const h = getUpstash();
  const existing = await h.client.keys(`${h.prefix}*`);
  if (existing.length > 0) await h.client.del(...existing);
}

/** Every physical key currently stored, prefix included, sorted. */
export async function storedKeys() {
  if (isFake) {
    const client = FakeRedis.latest();
    if (!client) return [];
    return [...client.strings.keys(), ...client.zsets.keys()].sort();
  }
  const h = getUpstash();
  return (await h.client.keys(`${h.prefix}*`)).sort();
}

/** Remaining TTL in seconds for a physical key: -2 missing, -1 no expiry. */
export async function ttlOf(physicalKey) {
  if (isFake) return FakeRedis.latest().ttl(physicalKey);
  return await getUpstash().client.ttl(physicalKey);
}

/** Write a raw value, bypassing the adapter's JSON encoding. */
export async function writeRaw(physicalKey, value) {
  if (isFake) {
    FakeRedis.latest().strings.set(physicalKey, { value, expireAt: null });
    return;
  }
  await getUpstash().client.set(physicalKey, value);
}
