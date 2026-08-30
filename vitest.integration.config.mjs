import { defineConfig } from 'vitest/config';

// Runs the same suite as vitest.config.mjs, but against the local SRH container
// instead of the in-memory fake, so real Redis answers every command. Start the
// stack first: `npm run redis:up`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/wait-for-srh.js'],
    // Real network round-trips, and the overflow tests issue a few hundred of
    // them, so the default timeout is too tight.
    testTimeout: 30_000,
    // One file at a time: they all share a single Redis and each flushes the
    // keyspace between tests.
    fileParallelism: false,
    env: {
      TEST_REDIS: 'real',
      UPSTASH_REDIS_REST_URL: 'http://localhost:8079',
      // Matches SRH_TOKEN in docker-compose.yml.
      UPSTASH_REDIS_REST_TOKEN: 'vngeoguessr-local-token',
      KEY_PREFIX: 'vngeoguessr:',
    },
  },
});
