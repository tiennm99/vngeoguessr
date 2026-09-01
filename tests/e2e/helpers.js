// Browser-boundary stubs shared by the E2E specs.
//
// Everything the app fetches -- /api/* and the panorama image -- is answered
// here with page.route, so the requests never reach the dev server's handlers
// and the suite needs no Redis, Neon, Mapillary, or .env. The stub payloads
// mirror the real route response shapes; a contract change should be made in
// the route tests first, then reflected here.

import { readFileSync } from 'node:fs';

// Resolved from the project root: Playwright runs specs with the repo as cwd,
// and import.meta is unavailable here because the specs compile as CJS.
const PANO_FIXTURE = 'tests/e2e/fixtures/pano.png';

// The image URL the new-game stub hands out; the image route below serves the
// local fixture for it, so nothing leaves the machine.
export const PANO_IMAGE_URL = 'https://pano.invalid/e2e-round.png';

export const USERNAME_STORAGE_KEY = 'vngeoguessr_username';

/** /api/new-game response for one TPHCM round. */
export function newGameResponse(sessionId, round) {
  return {
    success: true,
    sessionId,
    region: {
      code: 'TPHCM',
      name: 'Ho Chi Minh',
      path: ['Vietnam', 'Ho Chi Minh'],
      level: 'province',
    },
    // A distinct URL per round, as in production (the session id is NOT the
    // distinguisher there -- the route reuses it across rounds): a fixed URL
    // would let a broken next-round image swap pass unnoticed.
    imageData: { url: `${PANO_IMAGE_URL}?round=${round}`, isPano: true },
  };
}

/** /api/guess response: a 123m round on a TPHCM pick, revealed as District 7. */
export function guessResponse(username) {
  // `points` is what this round added at that level (each board judges by its
  // own ladder); `score` is the accumulated total. Values mirror what the
  // real route computed for a 123m guess when this stub was written: 5 on the
  // TPHCM (picked) ladder, +4 on District 7's own ladder, +5 above it.
  const scoreLevel = (code, name, rank, points) =>
    ({ code, name, username, points, score: 3, rank, trimmed: false });
  const distanceLevel = (code, name, rank) => ({ code, name, username, distance: 123, rank });
  return {
    success: true,
    gameResult: {
      distance: 123,
      score: 5,
      // The picked region's ladder as the real route returns it for TPHCM
      // (bbox-scaled from the generated tree at the time of writing).
      bands: [
        { maxMeters: 442, points: 5 },
        { maxMeters: 885, points: 4 },
        { maxMeters: 1770, points: 3 },
        { maxMeters: 4425, points: 2 },
        { maxMeters: 8849, points: 1 },
      ],
      levels: [
        scoreLevel('TPHCM-Q7', 'District 7', 1, 4),
        scoreLevel('TPHCM', 'Ho Chi Minh', 2, 5),
        scoreLevel('VN', 'Vietnam', 5, 5),
      ],
      distanceLevels: [
        distanceLevel('TPHCM-Q7', 'District 7', 1),
        distanceLevel('TPHCM', 'Ho Chi Minh', 3),
        distanceLevel('VN', 'Vietnam', 9),
      ],
      region: {
        code: 'TPHCM-Q7',
        name: 'District 7',
        path: ['Vietnam', 'Ho Chi Minh', 'District 7'],
        level: 'district',
      },
      globalRank: 5,
      cityRank: 2,
      globalDistanceRank: 9,
      cityDistanceRank: 3,
      exactLocation: { lat: 10.7411, lng: 106.7218 },
    },
    leaderboard: { message: 'Score added at 3 levels (+4, +5, +5)' },
    distance: { message: 'Distance record: 123m' },
    message: 'Game result processed successfully',
  };
}

/** /api/leaderboard response with recognisable rows. */
export function leaderboardResponse() {
  return {
    success: true,
    leaderboard: [
      { username: 'top-player', score: 42, rank: 1 },
      { username: 'runner-up', score: 17, rank: 2 },
    ],
    count: 2,
    region: { code: 'VN', name: 'Vietnam' },
    leaderboardType: 'score',
    type: 'global',
    cityCode: null,
  };
}

/**
 * Intercept every request the game makes. Call before page.goto.
 * @param {import('@playwright/test').Page} page Playwright page.
 * @param {string} username Player name echoed into guess responses.
 */
export async function stubGameApis(page, username) {
  let round = 0;
  await page.route('**/api/new-game**', async (route) => {
    round += 1;
    // Echo a requested sessionId exactly as the real route does -- production
    // reuses one id across a player's consecutive rounds.
    const requested = new URL(route.request().url()).searchParams.get('sessionId');
    await route.fulfill({ json: newGameResponse(requested || `e2e-session-${round}`, round) });
  });
  await page.route('**/api/guess', async (route) => {
    await route.fulfill({ json: guessResponse(username) });
  });
  await page.route('**/api/skip', async (route) => {
    await route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/leaderboard**', async (route) => {
    await route.fulfill({ json: leaderboardResponse() });
  });
  await page.route(`${PANO_IMAGE_URL}*`, async (route) => {
    await route.fulfill({ contentType: 'image/png', body: readFileSync(PANO_FIXTURE) });
  });
  // Leaflet's base tiles are the one request the app makes to a third party.
  // Stub them too, or every run hammers openstreetmap.org and the suite is not
  // actually offline. Both providers from src/lib/map-tiles.js are stubbed:
  // the dev server loads .env, so a filled-in NEXT_PUBLIC_GEOAPIFY_KEY would
  // otherwise send every run to Geoapify and spend metered free-tier credits.
  await page.route('**/tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: readFileSync(PANO_FIXTURE) });
  });
  await page.route('**/maps.geoapify.com/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: readFileSync(PANO_FIXTURE) });
  });
}

/**
 * Preload a username so the modal stays closed and guesses carry a known name.
 * @param {import('@playwright/test').Page} page Playwright page.
 * @param {string} username Name to store.
 */
export async function seedUsername(page, username) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [USERNAME_STORAGE_KEY, username]
  );
}
