import { test, expect } from '@playwright/test';
import { stubGameApis, seedUsername } from './helpers.js';

// The homepage: region picker built from the committed tree, and the
// leaderboard modal. All data is client-bundled except the leaderboard fetch,
// which is stubbed.

test.beforeEach(async ({ page }) => {
  await seedUsername(page, 'e2e-player');
  await stubGameApis(page, 'e2e-player');
  await page.goto('/');
});

test('offers the country and every province', async ({ page }) => {
  await expect(page.getByRole('link', { name: /Play anywhere in Vietnam/ })).toBeVisible();
  for (const province of ['Ha Noi', 'Hồ Chí Minh', 'Da Nang', 'Lam Dong', 'Long An']) {
    await expect(page.getByRole('button', { name: new RegExp(province) })).toBeVisible();
  }
});

test('expands a province to playable district links', async ({ page }) => {
  await page.getByRole('button', { name: /Hồ Chí Minh/ }).click();
  await expect(page.getByRole('link', { name: /Play anywhere in Hồ Chí Minh/ })).toBeVisible();
  const district7 = page.getByRole('link', { name: /Quận 7/ });
  await expect(district7).toBeVisible();
  await expect(district7).toHaveAttribute('href', '/game/tphcm-q7');
});

test('lists an uncovered district as disabled, with the reason', async ({ page }) => {
  // Cu Chi has no OSM boundary left; it must be shown, not hidden, and carry
  // no game link.
  await page.getByRole('button', { name: /Hồ Chí Minh/ }).click();
  const row = page.locator('div', { hasText: /^Củ Chino map data$/ }).last();
  await expect(row).toBeVisible();
  await expect(page.getByRole('link', { name: /^Củ Chi$/ })).toHaveCount(0);
});

test('shows the build commit in the debug footer and copies it on click', async ({ page, context }) => {
  // The dev server resolves the sha from git, so this asserts the real wiring:
  // config env -> layout -> footer -> clipboard.
  //
  // The sha and the copy control are two elements, not one: the label links to
  // the commit on GitHub and the button beside it copies the full sha. Both
  // halves are asserted here.
  const shaLink = page.getByRole('link', { name: /^View build commit [0-9a-f]{40} on GitHub$/ });
  await expect(shaLink).toBeVisible();
  // The label is the short form; the href carries the full one.
  await expect(shaLink).toHaveText(/^[0-9a-f]{7}$/);
  await expect(shaLink).toHaveAttribute('href', /\/commit\/[0-9a-f]{40}$/);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy build commit' }).click();

  // The glyph swap is decorative (aria-hidden); the accessible name is what
  // announces the state, so that is what gets asserted.
  await expect(page.getByRole('button', { name: 'Build commit copied' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^[0-9a-f]{40}$/);
});

test('shows the stubbed leaderboard in the modal', async ({ page }) => {
  await page.getByRole('button', { name: /Leaderboard/i }).click();
  await expect(page.getByText('top-player')).toBeVisible();
  await expect(page.getByText('runner-up')).toBeVisible();
});
