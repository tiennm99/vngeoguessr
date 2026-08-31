import { defineConfig, devices } from '@playwright/test';

// E2E smoke tests for the UI that vitest cannot reach. Every /api/* call and
// the panorama image are stubbed at the browser boundary (tests/e2e/helpers.js),
// so the dev server this config starts never touches Redis, Neon, or Mapillary
// -- the suite runs offline with no .env at all.
//
// Specs are *.spec.js so vitest (tests/**/*.test.js) never picks them up, and
// vice versa.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  // The suite is deterministic (no live services); a failure is a real one.
  retries: 0,
  // A cold `next dev` compiles /game on first navigation, which can take
  // longer than the 30s default while workers race for the same compile.
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    // Reuse a dev server the developer already has running; the stubs make the
    // tests indifferent to whatever backend that server is configured with.
    // Never in CI, where adopting an unknown :3000 would hide a broken build.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
