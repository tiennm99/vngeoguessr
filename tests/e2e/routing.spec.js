import { test, expect } from '@playwright/test';
import { stubGameApis, seedUsername, seedHintSeen } from './helpers.js';

// The region lives in the path (/game/tphcm), and every URL shape that used to
// work still has to. A dead bookmark produces no error anyone sees, so these
// assertions are the only thing that would notice a broken redirect.
//
// URLs are asserted exactly, not by partial match: an unanchored /\/game\/VN/
// would also pass for /game/vnsomething.

/**
 * The path a navigation actually settled on, query string included.
 *
 * Compared as one string rather than pathname alone: proving the query is
 * GONE is half the point of these tests -- a config-level redirect would have
 * carried ?region= onto the destination. Host-free so the spec does not
 * duplicate playwright.config.js's baseURL.
 * @param {import('@playwright/test').Page} page Playwright page.
 * @returns {string} e.g. '/game/TPHCM'.
 */
function landedAt(page) {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

test.beforeEach(async ({ page }) => {
  await seedUsername(page, 'e2e-router');
  await seedHintSeen(page);
  await stubGameApis(page, 'e2e-router');
});

test('serves the canonical region URL without redirecting', async ({ page }) => {
  const response = await page.goto('/game/tphcm');
  expect(response.status()).toBe(200);
  expect(landedAt(page)).toBe('/game/tphcm');
  // Landed on a real round, not an error panel.
  await expect(page.getByText('Ho Chi Minh', { exact: true })).toBeVisible();
});

test('redirects the legacy ?region= form', async ({ page }) => {
  await page.goto('/game?region=TPHCM');
  expect(landedAt(page)).toBe('/game/tphcm');
});

test('redirects the legacy ?location= form', async ({ page }) => {
  await page.goto('/game?location=TPHCM');
  expect(landedAt(page)).toBe('/game/tphcm');
});

test('prefers region over location when a link carries both', async ({ page }) => {
  // Matches how the old client resolved it: `region` first, `location` as the
  // fallback. A link carrying both must not change meaning in the migration.
  await page.goto('/game?region=TPHCM&location=HN');
  expect(landedAt(page)).toBe('/game/tphcm');
});

test('sends a region-less /game to the country round', async ({ page }) => {
  await page.goto('/game');
  expect(landedAt(page)).toBe('/game/vn');
});

test('treats an empty region param as region-less', async ({ page }) => {
  // firstValue() reads '' as "no value", so an empty param falls through to
  // the country rather than landing on a broken `/game/`.
  await page.goto('/game?region=');
  expect(landedAt(page)).toBe('/game/vn');
});

test('serves an uppercase URL directly, without redirecting', async ({ page }) => {
  // Nothing in the app generates an uppercase URL, but a hand-edited one has
  // to play rather than 404. Deliberately NOT redirected to the lowercase
  // form: a redirect on a prerendered route gets cached as that route's
  // response, and one stray analytics row costs less than that mechanism.
  const response = await page.goto('/game/TPHCM');
  expect(response.status()).toBe(200);
  expect(landedAt(page)).toBe('/game/TPHCM');
  await expect(page.getByText('Ho Chi Minh', { exact: true })).toBeVisible();
});

test('lowercases an uppercase legacy region in one hop', async ({ page }) => {
  // The legacy handler applies the slug convention while building the
  // destination, so this lands lowercase in a single redirect. Also proves the
  // redirect leaves no query behind -- a config-level rule would have carried
  // ?region=HN onto the destination.
  await page.goto('/game?region=HN');
  expect(landedAt(page)).toBe('/game/hn');
});

test('encodes a hostile legacy region value instead of 500ing or escaping the path', async ({ page }) => {
  // The legacy value goes into a Location header. Unencoded, a CRLF makes Node
  // throw (500) and a '../' would be normalised by the browser onto a
  // different path. Both must end at the honest 404 instead.
  const crlf = await page.goto('/game?region=a%0d%0ab');
  expect(crlf.status()).toBe(404);

  const traversal = await page.goto('/game?region=..%2F..%2Fdebug');
  expect(traversal.status()).toBe(404);
  expect(landedAt(page)).not.toBe('/debug');
});

test('404s an unknown region', async ({ page }) => {
  const response = await page.goto('/game/NOTAREGION');
  // Asserted on status, never on the not-found page's wording, which is free
  // to change without breaking this.
  expect(response.status()).toBe(404);
});

test('serves a real region with no imagery instead of 404ing it', async ({ page }) => {
  // Deliberately NOT a 404. The API answers an uncovered region with a written
  // message ("... has no street view coverage yet") and the page renders it;
  // a 404 would replace a good answer with a worse one. The APIs are stubbed
  // here, so this asserts only the routing half -- that the page exists and
  // serves. The message itself is the API's contract, covered in
  // tests/region-request.test.js.
  const { isRegion, isPlayable } = await import('../../src/lib/regions.js');
  const code = 'TPHCM-CUCHI';
  expect(isRegion(code), `${code} should still be a region`).toBe(true);
  expect(isPlayable(code), `${code} gained coverage; pick another fixture`).toBe(false);

  const { regionSlug } = await import('../../src/lib/regions.js');
  const response = await page.goto(`/game/${regionSlug(code)}`);
  expect(response.status()).toBe(200);
  expect(landedAt(page)).toBe(`/game/${regionSlug(code)}`);
});
