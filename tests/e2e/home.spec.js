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
  for (const province of ['Ha Noi', 'Ho Chi Minh', 'Da Nang', 'Lam Dong', 'Long An']) {
    await expect(page.getByRole('button', { name: new RegExp(province) })).toBeVisible();
  }
});

test('expands a province to playable district links', async ({ page }) => {
  await page.getByRole('button', { name: /Ho Chi Minh/ }).click();
  await expect(page.getByRole('link', { name: /Play anywhere in Ho Chi Minh/ })).toBeVisible();
  const district7 = page.getByRole('link', { name: /District 7/ });
  await expect(district7).toBeVisible();
  await expect(district7).toHaveAttribute('href', '/game?region=TPHCM-Q7');
});

test('lists an uncovered district as disabled, with the reason', async ({ page }) => {
  // Cu Chi has no OSM boundary left; it must be shown, not hidden, and carry
  // no game link.
  await page.getByRole('button', { name: /Ho Chi Minh/ }).click();
  const row = page.locator('div', { hasText: /^Cu Chino map data$/ }).last();
  await expect(row).toBeVisible();
  await expect(page.getByRole('link', { name: /^Cu Chi$/ })).toHaveCount(0);
});

test('shows the build commit in the debug footer and copies it on click', async ({ page, context }) => {
  // The dev server resolves the sha from git, so this asserts the real wiring:
  // config env -> layout -> footer -> clipboard.
  const stamp = page.getByRole('button', { name: 'Copy build commit' });
  await expect(stamp).toBeVisible();
  await expect(stamp).toHaveText(/^[0-9a-f]{7}$/);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await stamp.click();
  await expect(stamp).toHaveText('copied!');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^[0-9a-f]{40}$/);
});

test('shows the stubbed leaderboard in the modal', async ({ page }) => {
  await page.getByRole('button', { name: /Leaderboard/i }).click();
  await expect(page.getByText('top-player')).toBeVisible();
  await expect(page.getByText('runner-up')).toBeVisible();
});
