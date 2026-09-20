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
  await expect(page.getByText('Hồ Chí Minh', { exact: true })).toBeVisible();
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
  await expect(page.getByText('Hồ Chí Minh', { exact: true })).toBeVisible();
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

test('404s a spelling that only uppercases into a region', async ({ page }) => {
  // U+0131 dotless i: 'hn-badınh'.toUpperCase() is 'HN-BADINH', a real code.
  // Accepting it would serve a real round at a URL that is its own ISR entry
  // and its own analytics row -- the split the region path exists to avoid.
  // Asserted through a real request because the encoding is half the point.
  const response = await page.goto('/game/hn-bad%C4%B1nh');
  expect(response.status()).toBe(404);
});

test('serves a real region with no imagery instead of 404ing it', async ({ page }) => {
  // Deliberately NOT a 404. The API answers an uncovered region with a written
  // message ("... has no street view coverage yet") and the page renders it;
  // a 404 would replace a good answer with a worse one. The APIs are stubbed
  // here, so this asserts only the routing half -- that the page exists and
  // serves. The message itself is the API's contract, covered in
  // tests/region-request.test.js.
  const { isRegion, isPlayable, regionSlug } = await import('../../src/lib/regions.js');
  const code = 'TPHCM-CUCHI';
  expect(isRegion(code), `${code} should still be a region`).toBe(true);
  expect(isPlayable(code), `${code} gained coverage; pick another fixture`).toBe(false);

  const response = await page.goto(`/game/${regionSlug(code)}`);
  expect(response.status()).toBe(200);
  expect(landedAt(page)).toBe(`/game/${regionSlug(code)}`);
});

test('the pre-paint theme script is served executable', async ({ request }) => {
  // The other half of InlineScript's contract. Asserted on the raw HTML, with
  // no browser, because in a browser this is invisible: ThemeToggle re-applies
  // the theme on mount (ThemeToggle.js:33-39), so <html> ends up with the right
  // class whether or not the script ran -- just a flash later. An executable
  // type in the served markup is the only thing that proves it runs before
  // paint, so that is what this pins.
  for (const path of ['/', '/game/tphcm']) {
    const html = await (await request.get(path)).text();
    const headEnd = html.indexOf('</head>');
    // Asserted, not assumed: indexOf returning -1 would slice to nothing and
    // quietly turn the checks below into assertions about an empty string.
    expect(headEnd, `${path} served no </head>`).toBeGreaterThan(0);
    const head = html.slice(0, headEnd);
    expect(head, `${path} lost its inline theme script`).toContain('classList.toggle');
    expect(head, `${path} serves the theme script inert -- it would flash`)
      .toMatch(/<script type="text\/javascript">\(function\(\)\{try\{/);
    expect(head, `${path} serves the theme script as a data block`)
      .not.toContain('text/plain');
  }
});

test('the region 404 renders without a console error', async ({ page }) => {
  // This route is the only one React client-renders the root layout for (the
  // server sends Next's error shell), so it is the only one where the layout's
  // inline theme script reaches React on the client. Left untyped, React warns
  // "Encountered a script tag while rendering React component" -- pointing at
  // a script that silently never runs. InlineScript marks it text/plain there.
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/game/notaregion');
  await expect(page.getByRole('heading', { name: 'No such region' })).toBeVisible();

  // The browser logs the 404 response itself as a failed resource load. That
  // one is the point of the page; everything else is a defect.
  const real = errors.filter((e) => !e.includes('Failed to load resource'));
  expect(real, `console errors on the region 404:\n${real.join('\n')}`).toEqual([]);
});

test('the region 404 offers a way out, in the visitor\'s theme', async ({ page }) => {
  // A thrown notFound() is served from Next's error shell, which carries none
  // of the root layout's pre-paint theme script -- so without the re-apply in
  // not-found.js this page renders light for a dark-theme visitor.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => window.localStorage.setItem('vngeoguessr_theme', 'dark'));

  const response = await page.goto('/game/notaregion');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'No such region' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pick a region' })).toBeVisible();
  // The way out has to go somewhere: a visible link to nowhere is still a dead
  // end, and this is the only exit on the page.
  await expect(page.getByRole('link', { name: 'Pick a region' })).toHaveAttribute('href', '/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  // The footer proves the panel ends up inside the root layout, whose flex
  // column is what centres it. Post-hydration only, and deliberately so: the
  // server response here is Next's error shell, which carries neither the
  // layout nor this panel (measured: `curl /game/notaregion` has zero
  // occurrences of either). First paint is the empty shell; this assertion
  // cannot see it, and nothing in this suite can.
  await expect(page.getByText('Made by')).toBeVisible();
});

test('an unmatched path gets the app-wide 404, not a bare Next page', async ({ page }) => {
  const response = await page.goto('/nosuchpath');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to VNGeoGuessr' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to VNGeoGuessr' })).toHaveAttribute('href', '/');
  // A not-found route can carry its own metadata; the region 404, served from
  // the error shell, cannot. So this is the only 404 whose tab can say so.
  await expect(page).toHaveTitle('Page not found — VNGeoGuessr');
  // The footer proves it rendered inside the root layout: Next's stock page
  // pushes it off screen with its own full-height wrapper.
  await expect(page.getByText('Made by')).toBeVisible();
});
