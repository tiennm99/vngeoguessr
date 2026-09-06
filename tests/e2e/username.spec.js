import { test, expect } from '@playwright/test';
import { stubGameApis, seedUsername, seedHintSeen, USERNAME_STORAGE_KEY } from './helpers.js';

// With no stored name the prompt opens on landing, so every way out of it
// (save, skip, dismiss) leaves a name behind before Play is ever clicked --
// see the comment above the effect in src/app/page.js. No seeded name in the
// fresh-profile tests: that timing is the behavior under test.
//
// The Play-click interception in handlePlayClick() is the remaining fallback
// for a name that goes missing between landing and the click. It is not
// reachable by an ordinary gesture, so nothing here exercises it.

test.beforeEach(async ({ page }) => {
  await stubGameApis(page, 'fresh-player');
  await seedHintSeen(page);
  await page.goto('/');
});

test('landing asks for a name, and Play then goes straight into the round', async ({ page }) => {
  // The prompt comes before Play rather than interrupting it, so the name is
  // already settled by the time the player commits to a region.
  const dialog = page.getByRole('dialog', { name: /Welcome to VNGeoGuessr/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Username/).fill('fresh-player');
  await dialog.getByRole('button', { name: 'Save name' }).click();

  // Saving with nothing pending just closes: there is no navigation to resume.
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), USERNAME_STORAGE_KEY)
  ).toBe('fresh-player');

  // Play is now uninterrupted.
  await page.getByRole('link', { name: /Play anywhere in Vietnam/ }).click();
  await expect(page).toHaveURL(/\/game\/vn$/);
});

test('skip generates a random name and still lets the game start', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: /Welcome to VNGeoGuessr/ });
  await dialog.getByRole('button', { name: /Skip — random name/ }).click();
  await expect(dialog).toBeHidden();

  // Skip is not "play anonymously": it persists a generated name exactly like
  // a typed one, so the round still reaches the leaderboard under something
  // the player can recognise and later edit.
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), USERNAME_STORAGE_KEY)
  ).toMatch(/^Player-[0-9a-z]{6}$/);

  await page.getByRole('link', { name: /Play anywhere in Vietnam/ }).click();
  await expect(page).toHaveURL(/\/game\/vn$/);
});

test('rejects an invalid username with a visible error', async ({ page }) => {
  // Already open on landing -- no stored name in this profile.
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
