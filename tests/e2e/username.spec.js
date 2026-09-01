import { test, expect } from '@playwright/test';
import { stubGameApis, seedUsername, seedHintSeen, USERNAME_STORAGE_KEY } from './helpers.js';

// The name prompt appears at the first Play click -- when the name is about
// to matter -- not on landing. No seeded name in the fresh-profile tests:
// that timing is the behavior under test.

test.beforeEach(async ({ page }) => {
  await stubGameApis(page, 'fresh-player');
  await seedHintSeen(page);
  await page.goto('/');
});

test('landing shows no prompt; the first Play click asks, saves, and starts the game', async ({ page }) => {
  // The landing page introduces the game first: no ambush modal, just an
  // always-visible entry point for setting a name later.
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Set name' })).toBeVisible();

  await page.getByRole('link', { name: /Play anywhere in Vietnam/ }).click();

  const dialog = page.getByRole('dialog', { name: /Welcome to VNGeoGuessr/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Username/).fill('fresh-player');
  await dialog.getByRole('button', { name: 'Save name' }).click();

  // Saving resumes the intercepted navigation into the round.
  await expect(page).toHaveURL(/\/game\?region=VN/);
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), USERNAME_STORAGE_KEY)
  ).toBe('fresh-player');
});

test('skip generates a random name and still starts the game', async ({ page }) => {
  await page.getByRole('link', { name: /Play anywhere in Vietnam/ }).click();
  const dialog = page.getByRole('dialog', { name: /Welcome to VNGeoGuessr/ });
  await dialog.getByRole('button', { name: /Skip — random name/ }).click();

  await expect(page).toHaveURL(/\/game\?region=VN/);
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), USERNAME_STORAGE_KEY)
  ).toMatch(/^Player-[0-9a-z]{6}$/);
});

test('rejects an invalid username with a visible error', async ({ page }) => {
  await page.getByRole('button', { name: 'Set name' }).click();
  const dialog = page.getByRole('dialog', { name: /Welcome to VNGeoGuessr/ });
  await dialog.getByLabel(/Username/).fill('bad name!');
  await dialog.getByRole('button', { name: 'Save name' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/letters, numbers/);
  await expect(dialog).toBeVisible();
});

test('the header chip reopens the prompt to change an existing name', async ({ page }) => {
  await seedUsername(page, 'first-name');
  await page.reload();

  const chip = page.getByRole('button', { name: /Playing as first-name/ });
  await expect(chip).toBeVisible();
  await chip.click();

  const dialog = page.getByRole('dialog', { name: /Change your name/ });
  await expect(dialog.getByLabel(/Username/)).toHaveValue('first-name');
  await dialog.getByLabel(/Username/).fill('second-name');
  await dialog.getByRole('button', { name: 'Save name' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Playing as second-name/ })).toBeVisible();
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), USERNAME_STORAGE_KEY)
  ).toBe('second-name');
});
