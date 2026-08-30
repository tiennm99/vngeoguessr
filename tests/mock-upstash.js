// Shared vi.mock factory for @upstash/redis.
//
// Each test file hoists its own vi.mock call, but they all delegate here so the
// fake-vs-real switch lives in one place. With TEST_REDIS=real the factory hands
// back the untouched SDK, which then talks to SRH.

export async function upstashModule(importOriginal) {
  if (process.env.TEST_REDIS === 'real') return importOriginal();
  const { FakeRedis } = await import('./fake-upstash-redis.js');
  return { Redis: FakeRedis };
}
