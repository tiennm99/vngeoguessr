import { test, expect } from '@playwright/test';
import { stubGameApis, USERNAME_STORAGE_KEY } from './helpers.js';

// First-visit username capture. No seeded name here: the modal appearing on a
// clean profile is the behavior under test.

test.beforeEach(async ({ page }) => {
  await stubGameApis(page, 'fresh-player');
  await page.goto('/');
});

test('asks for a username on first visit and remembers it', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: /Welcome to VNGeoGuessr/ });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/Username/).fill('fresh-player');
  await dialog.getByRole('button', { name: 'Start Playing' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Playing as fresh-player')).toBeVisible();
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), USERNAME_STORAGE_KEY)
  ).toBe('fresh-player');

  // A reload must not ask again.
  await page.reload();
  await expect(page.getByRole('dialog', { name: /Welcome to VNGeoGuessr/ })).toBeHidden();
});

test('rejects an invalid username with a visible error', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: /Welcome to VNGeoGuessr/ });
  await dialog.getByLabel(/Username/).fill('bad name!');
  await dialog.getByRole('button', { name: 'Start Playing' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/letters, numbers/);
  await expect(dialog).toBeVisible();
});
