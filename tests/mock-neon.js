// Shared vi.mock factory for @neondatabase/serverless.
//
// Each test file hoists its own vi.mock call, but they all delegate here so the
// fake lives in one place. Unlike the Redis mock there is no 'real' lane: the
// fake IS Postgres (PGlite), and the production driver only speaks to Neon's
// own endpoint, which has no local equivalent worth proxying.

export async function neonModule() {
  const { fakeNeonModule } = await import('./fake-neon.js');
  return fakeNeonModule();
}
