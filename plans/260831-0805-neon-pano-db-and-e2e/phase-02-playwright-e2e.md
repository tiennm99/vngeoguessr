# Phase 2 — Playwright E2E smoke tests

## Context

No component/E2E coverage exists; GameClient, RegionPicker, RegionSelect,
LeafletMap, results flow are manual-test-only. Requirement: run offline, zero
secrets — all `/api/*` and external image requests stubbed at the browser
boundary with `page.route`, so the dev server never touches Redis, Neon, or
Mapillary.

## Files

New:
- `playwright.config.mjs` (root; config file, highlight) — testDir `tests/e2e`,
  match `*.spec.js` (vitest picks up `tests/**/*.test.js` only, no collision),
  chromium project, `webServer: npm run dev` on port 3000 with
  `reuseExistingServer: true`.
- `tests/e2e/helpers.js` — shared stubs: `/api/new-game`, `/api/guess`,
  `/api/skip`, `/api/leaderboard` fixtures; Mapillary thumb URL → local
  equirect fixture; localStorage username preseed.
- `tests/e2e/fixtures/pano.png` — small 2:1 equirectangular PNG (generated
  once by a throwaway script, committed as a binary fixture).
- Specs:
  - `home.spec.js` — provinces render from the committed tree, unplayable
    district rendered disabled with reason, leaderboard modal opens and lists
    stubbed rows.
  - `username.spec.js` — modal appears without a stored username, saves to
    localStorage, not shown again.
  - `game.spec.js` — start a round (stubbed new-game), panorama viewer mounts,
    click the Leaflet map to place a marker, submit (stubbed guess), results
    show distance, score, region path, and rank; next-round resets.

Changed:
- `package.json` — devDep `@playwright/test`, script `test:e2e` (config file,
  highlight).
- `.gitignore` — `playwright-report/`, `test-results/` (config file,
  highlight).
- docs/development.md — E2E section (install browsers via
  `npx playwright install chromium`, `npm run test:e2e`, no env needed).
- docs/project-structure.md, tech-stack.md — testing entries.

## Steps

1. Install `@playwright/test` + chromium.
2. Config + helpers + fixture image.
3. Specs, run headed locally until green, then headless.

## Validation

`npm run test:e2e` green with no `.env`; `npm test` unaffected.

## Risk / rollback

Additive only. Known flake risks: Leaflet click coordinates (use bounding-box
center), PhotoSphere WebGL in headless chromium (assert container mount, not
rendering; `--use-gl=swiftshader` fallback if needed).
