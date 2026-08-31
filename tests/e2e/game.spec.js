import { test, expect } from '@playwright/test';
import { stubGameApis, seedUsername } from './helpers.js';

// A full round against stubbed APIs: load the panorama, place a guess on the
// Leaflet map, submit, read the reveal, start the next round. The panorama is
// a local fixture image, so this exercises the viewer mount and the round
// state machine, not Mapillary.

test.beforeEach(async ({ page }) => {
  await seedUsername(page, 'e2e-player');
  await stubGameApis(page, 'e2e-player');
  await page.goto('/game?region=TPHCM');
});

test('plays a round to the reveal and into the next one', async ({ page }) => {
  // Round loaded: header badge names the picked region, viewer container is up.
  await expect(page.getByText('Ho Chi Minh', { exact: true })).toBeVisible();

  // No guess yet: the submit button says so and is disabled.
  const submit = page.getByRole('button', { name: /Place a guess first/ });
  await expect(submit).toBeDisabled();

  // Place a guess. The Leaflet container is the click target; anywhere on the
  // map sets coordinates.
  const map = page.locator('.leaflet-container').first();
  await map.waitFor();
  await map.click({ position: { x: 200, y: 150 } });

  const armed = page.getByRole('button', { name: 'Submit Guess' });
  await expect(armed).toBeEnabled();
  await armed.click();

  // The reveal: score, formatted distance, and the resolved region path the
  // client could not have known before the guess.
  const dialog = page.getByRole('dialog', { name: /Round Result/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('123m away')).toBeVisible();
  await expect(dialog.getByText('Vietnam › Ho Chi Minh › District 7')).toBeVisible();
  await expect(dialog.getByText('Score added at 3 levels (+3)')).toBeVisible();
  await expect(dialog.getByText('District 7', { exact: true })).toBeVisible();

  // Next round resets to a fresh, unguessed state.
  await dialog.getByRole('button', { name: 'Next Round' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Place a guess first/ })).toBeDisabled();
});

test('skip abandons the round and loads a new one', async ({ page }) => {
  const skipRequest = page.waitForRequest('**/api/skip');
  const nextRound = page.waitForResponse('**/api/new-game**');
  await page.getByRole('button', { name: 'Skip' }).click();
  await skipRequest;
  await nextRound;
  // Still in the game, still unguessed.
  await expect(page.getByRole('button', { name: /Place a guess first/ })).toBeDisabled();
});

test('back returns to the region picker', async ({ page }) => {
  await page.getByRole('button', { name: 'Back to menu' }).click();
  await expect(page.getByRole('link', { name: /Play anywhere in Vietnam/ })).toBeVisible();
});
