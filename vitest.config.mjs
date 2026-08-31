import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // lib/upstash.js refuses to build a client without these. The tests mock the
    // SDK itself, so the values are never dialled -- they only have to exist.
    env: {
      UPSTASH_REDIS_REST_URL: 'http://fake-upstash.test',
      UPSTASH_REDIS_REST_TOKEN: 'fake-token',
      // lib/pano-db.js refuses to build a handle without this. The tests mock
      // the Neon SDK itself (PGlite behind it), so the value is never dialled.
      DATABASE_URL: 'postgres://fake-neon.test/fake',
      // Pinned so the assertions on physical keys hold regardless of what the
      // developer's .env sets.
      KEY_PREFIX: 'vngeoguessr:',
    },
  },
});
