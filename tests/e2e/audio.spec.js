import { test, expect } from '@playwright/test';
import { stubGameApis, seedUsername, seedHintSeen } from './helpers.js';

// The audio layer, from the browser's side. What a headless run can honestly
// prove is state and wiring: that nothing is fetched before a gesture, that
// the toggles persist, and that the game header still fits a small phone with
// the extra control in it. Whether the sounds are any good, whether the loop
// seam is audible, and whether anything double-fires are questions for ears,
// and the plan leaves those to a manual pass.

const MUSIC_KEY = 'vngeoguessr_music';
const SFX_KEY = 'vngeoguessr_sfx';

test.beforeEach(async ({ page }) => {
  await seedUsername(page, 'e2e-player');
  await seedHintSeen(page);
  await stubGameApis(page, 'e2e-player');
});

test('requests no audio before the first user gesture', async ({ page }) => {
  const requested = [];
  await page.route('**/audio/**', async (route) => {
    requested.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 404, body: '' });
  });

  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Sound' }).first()).toBeVisible();
  // Every browser blocks audio until a gesture, so fetching a file before one
  // would be bandwidth spent on something that cannot play.
  expect(requested).toEqual([]);
});

test('remembers music and sound-effect choices independently', async ({ page }) => {
  await page.goto('/');
  const music = page.getByRole('button', { name: 'Music' });
  const sfx = page.getByRole('button', { name: 'Sound effects' });

  // Both default on: a first-time player hears the game.
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await expect(sfx).toHaveAttribute('aria-pressed', 'true');

  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await expect(sfx).toHaveAttribute('aria-pressed', 'true');

  expect(await page.evaluate((key) => localStorage.getItem(key), MUSIC_KEY)).toBe('off');
  // Never written, because it was never touched -- and an absent key reads as
  // the default, which is on.
  expect(await page.evaluate((key) => localStorage.getItem(key), SFX_KEY)).toBeNull();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Sound effects' })).toHaveAttribute('aria-pressed', 'true');
});

test('carries the choice from the menu into a round', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sound effects' }).click();

  await page.getByRole('link', { name: /Play anywhere in Vietnam/ }).click();
  await expect(page).toHaveURL(/\/game\/vn$/);

  // The game header shows the split pair at desktop widths.
  await expect(page.getByRole('button', { name: 'Sound effects' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'true');
});

// The game header carries Back, the region badges, ThemeToggle's three cells
// and the donate button before sound is added at all, which is why it collapses
// to a single mute switch below `sm`.
for (const width of [320, 360]) {
  test(`game header fits a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/game/tphcm');
    await expect(page.getByText('Ho Chi Minh', { exact: true })).toBeVisible();

    // One combined switch, not the pair: the pair is display:none here, which
    // also keeps it out of the accessibility tree.
    await expect(page.getByRole('button', { name: 'Sound', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Music' })).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);
  });
}

test('mutes everything from the compact switch on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto('/game/tphcm');
  await expect(page.getByText('Ho Chi Minh', { exact: true })).toBeVisible();

  const mute = page.getByRole('button', { name: 'Sound', exact: true });
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await mute.click();

  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate((key) => localStorage.getItem(key), MUSIC_KEY)).toBe('off');
  expect(await page.evaluate((key) => localStorage.getItem(key), SFX_KEY)).toBe('off');
});

test('plays on with audio files missing', async ({ page }) => {
  // A 404 on every sound must cost the player nothing but silence. The failure
  // this guards against is an unhandled rejection out of fetch/decode, which
  // `pageerror` does not report -- so the page records them itself.
  await page.addInitScript(() => {
    window.__rejections = [];
    addEventListener('unhandledrejection', (event) => {
      window.__rejections.push(String(event.reason));
    });
  });
  await page.route('**/audio/**', (route) => route.fulfill({ status: 404, body: '' }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/game/tphcm');
  await expect(page.getByText('Ho Chi Minh', { exact: true })).toBeVisible();

  // Effects stay ON here: muting them is what made an earlier version of this
  // test exercise only the music path.
  const pinRequest = page.waitForRequest((request) => request.url().includes('/audio/pin.mp3'));
  const map = page.locator('.leaflet-container').first();
  await map.waitFor();
  await map.click({ position: { x: 200, y: 150 } });
  await pinRequest;

  // The round is still playable: the guess registered despite the dead sound.
  await expect(page.getByRole('button', { name: 'Submit Guess' })).toBeEnabled();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__rejections)).toEqual([]);
});

// Both header variants are mounted at once, one of them display:none, so each
// has to hear about a change the other made -- otherwise rotating a phone past
// the breakpoint revealed a control showing its mount-time state, and the first
// press on it went the wrong way.
test('keeps both header variants in step across the breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto('/game/tphcm');
  await expect(page.getByText('Ho Chi Minh', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sound', exact: true }).click();

  await page.setViewportSize({ width: 900, height: 720 });
  await expect(page.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Sound effects' })).toHaveAttribute('aria-pressed', 'false');

  // And back the other way: unmute on the pair, then check the compact switch.
  await page.getByRole('button', { name: 'Music' }).click();
  await page.setViewportSize({ width: 360, height: 720 });
  await expect(page.getByRole('button', { name: 'Sound', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
