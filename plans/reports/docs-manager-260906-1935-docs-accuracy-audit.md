---
title: "Docs accuracy audit: feat/game-region-path-segment"
branch: feat/game-region-path-segment
date: 2026-09-06
status: DONE
---

# Docs accuracy audit

Report-only, no files modified. Every claim below was checked against source,
a test run, or a live request against the dev server already running on
`:3000` (read-only `curl`, not started/stopped by me).

## Verification run

- `npm test` → 268 passed, 19 files (matches baseline).
- `npm run lint` → 0 errors, 19 warnings; confirmed all 19 sit on lines outside
  this branch's diff (`git diff main...HEAD` for each warning's file).
- `grep -rn "^test(" tests/e2e/*.spec.js` → 28 (16 in `routing.spec.js`, 3+5+4
  in the other three specs) — matches baseline.
- Live `curl` against the running `localhost:3000`: `/game/%74phcm` → 200,
  `/game/tphcm` → 200, `/game/TPHCM` → 200, `/game/hn-bad%C4%B1nh` → 404,
  `/game/notaregion` → 404, `/game/tphcm-cuchi` → 200, `/game/dn-hoangsa` → 404.
- `.next-check/` (existing build artifact): 85 `/game/*.html` region pages,
  `<title>Ba Dinh — VNGeoGuessr</title>` / `<title>Vietnam — VNGeoGuessr</title>`,
  description meta present. `prerender-manifest.json` shows `/game/[region]` as
  the templated dynamic route with 85 static children; `/game` itself compiles
  as its own `page.js` (the redirect handler), consistent with "ƒ" in the plan.

## Findings, ranked by reader impact

### 1. HIGH — `plan.md` success criterion names a region that doesn't exist

`plans/260906-1122-game-region-path-segment/plan.md:176-177`

```
- [x] `/game/DN-HOANGSA` (real but unplayable) renders the existing coverage
      error panel, **not** a 404
```

`DN-HOANGSA` is not in `src/data/regions/index.js` — `isRegion('DN-HOANGSA')`
is `false`. Verified two ways: `node -e` against the generated tree (no key
starting `DN-HOANGSA`), and a live request — `curl localhost:3000/game/dn-hoangsa`
returns **404**, not the coverage panel the checkbox claims. The actual tested
fixture (in `tests/e2e/routing.spec.js:117-132` and confirmed live, 200) is
`TPHCM-CUCHI`. This checkbox was carried from an aspirational example in
`phase-01-dynamic-route.md:118` ("`DN-HOANGSA` or another real unplayable
code") and never swapped for the real one before being marked done.

Fix:
- `plans/260906-1122-game-region-path-segment/plan.md:176`
  old: `- [x] \`/game/DN-HOANGSA\` (real but unplayable) renders the existing coverage`
  new: `- [x] \`/game/tphcm-cuchi\` (real but unplayable) renders the existing coverage`

(Same stale code appears in `phase-01-dynamic-route.md:118,139` — lower
priority since that phase file predates the D3 rejection and is superseded by
`plan.md`'s own "D3 rejected too" section, but worth the same swap if touching
that file: `DN-HOANGSA` → `TPHCM-CUCHI` in both spots.)

### 2. HIGH — `plan.md`'s build gate doesn't name the gate that actually proves anything

`plans/260906-1122-game-region-path-segment/plan.md:182-183`

```
- [x] `npm test` green, `npm run lint` 0 errors, `npm run build` clean,
      `npm run test:e2e` green
```

`docs/development.md:120-129` documents, and this session's own task brief
confirms, that bare `npm run build` **exits 0 without building** when a dev
server holds `.next` — exactly the situation on this machine right now (a dev
server is listening on :3000). The fix report's own Gates table
(`plans/reports/fix-260906-1717-review-findings-resolved.md:225`) used
`npm run build:check` for this reason. As written, this success criterion can
be (and, on this machine, would be) satisfied by a false-positive.

Fix:
- `plans/260906-1122-game-region-path-segment/plan.md:182`
  old: `- [x] \`npm test\` green, \`npm run lint\` 0 errors, \`npm run build\` clean,`
  new: `- [x] \`npm test\` green, \`npm run lint\` 0 errors, \`npm run build:check\` clean,`

### 3. MEDIUM — `project-structure.md`'s Tests section is stale relative to `development.md`'s (same suite, two different descriptions)

`docs/project-structure.md:162-166` (unchanged from `main` — verified via
`git show main:docs/project-structure.md`) still says:

```
`tests/e2e/` holds the Playwright smoke specs (`*.spec.js`, so vitest never
collects them): the homepage picker, the username modal, and one full round,
all against browser-level stubs in `tests/e2e/helpers.js` with a fixture
panorama in `tests/e2e/fixtures/`. Deeper UI behavior (`RegionSelect.js`, the
coverage page, real panoramas) remains manual testing only.
```

`docs/development.md:97-105` (already updated this branch) describes the same
suite and *does* mention the new routing spec and its coverage:
"...the `/game/{slug}` routing contract (legacy `?region=` redirects,
unknown-region 404s)." `project-structure.md` was never updated to match — it
omits `tests/e2e/routing.spec.js` (16 of the 28 e2e tests, the largest single
spec file, entirely new this branch) and `tests/e2e/global-setup.js` (new,
untracked, addresses a real `next dev` cold-compile flake — confirmed by
reading the file and `playwright.config.mjs:13-15`).

Fix:
- `docs/project-structure.md:162-166`
  old:
  ```
  `tests/e2e/` holds the Playwright smoke specs (`*.spec.js`, so vitest never
  collects them): the homepage picker, the username modal, and one full round,
  all against browser-level stubs in `tests/e2e/helpers.js` with a fixture
  panorama in `tests/e2e/fixtures/`. Deeper UI behavior (`RegionSelect.js`, the
  coverage page, real panoramas) remains manual testing only.
  ```
  new:
  ```
  `tests/e2e/` holds the Playwright smoke specs (`*.spec.js`, so vitest never
  collects them): the homepage picker, the username modal, one full round, and
  the `/game/{slug}` routing contract (legacy redirects, unknown-region
  404s), all against browser-level stubs in `tests/e2e/helpers.js` with a
  fixture panorama in `tests/e2e/fixtures/`. `global-setup.js` warms the game
  routes once before the workers race for them, ahead of a `next dev`
  cold-compile timeout. Deeper UI behavior (`RegionSelect.js`, the coverage
  page, real panoramas) remains manual testing only.
  ```

### 4. Accurate, no change needed — `docs/game-flow.md` URL-shape section

Every claim verified against `src/lib/regions.js`, `src/app/game/[region]/page.js`,
`src/app/game/page.js`, and live requests:
- Lowercase path segment, uppercase-in-app codes, `regionSlug`/`regionFromSlug`
  as the sole casing authority — matches `regions.js:39-86`.
- Unknown region 404 vs. no-imagery region renders — matches
  `generateStaticParams` using `allRegions()` not `playableRegions()`
  (`page.js:19-21`) plus the D2 rationale.
- Uppercase plays without redirect — matches `regionFromSlug`'s doc comment and
  live `curl` (200, no redirect).
- Re-casing-only rule + percent-encoding exception — matches `regionFromSlug`'s
  JSDoc almost verbatim and live `curl` (`%74phcm` → 200, dotless-i homoglyph →
  404).
- Per-region titles — matches `generateMetadata` in `page.js:40-56` and the
  built HTML (`<title>Ba Dinh — VNGeoGuessr</title>`).
- `/game` bare → country, legacy `?region=`/`?location=` redirect, API routes
  keep query params — all matches `game/page.js`.

This section was already corrected this session (the two bullets the fix
report describes adding are present) and is fully propagated. No edit.

### 5. Accurate, no change needed — `project-structure.md` Game Pages list

`not-found.js`, `components/NotFoundPanel.js`, `components/InlineScript.js`,
`game/[region]/page.js`, `game/[region]/not-found.js`, `game/page.js` entries
all match the current files' actual behavior (read each). The
`InlineScript.js` entry and the reworded `not-found.js` entry (both already
edited this session, per `git diff`) are accurate: confirmed `InlineScript.js`
really does swap `text/javascript`/`text/plain` by `typeof window`, and the
region 404 really is client-rendered because `notFound()` is served from
Next's error shell (comment cross-checked against both files). Only gap is the
Tests section above (#3) — not this list.

### 6. Accurate, no change needed — `docs/development.md`

The `npm run build` vs `npm run build:check` gotcha, the "dev server needs
restarting" table, and the e2e description (routing contract included) are all
current and correctly scoped. No stale test-command claims found.

### 7. `plans/reports/fix-260906-1717-review-findings-resolved.md` spot-checks

Checked the load-bearing, independently-verifiable claims:
- `268 passed (19 files)` — reran, matches exactly.
- `0 errors, 19 warnings (all pre-existing, none in changed files)` — reran;
  confirmed each of the 19 warning locations sits outside `git diff
  main...HEAD` for its file (e.g. `GameClient.js:174` and `RegionPicker.js:131`
  are touched files but the warned lines are untouched by this branch's diff).
- `eslint.config.mjs` now ignores `test-results/` and `playwright-report/` —
  confirmed via `git diff`.
- `theme.js` JSDoc rewrite — confirmed via `git diff`, matches the claimed
  before/after.
- M2 per-region titles — confirmed against built HTML.
- `%74phcm` → 200 — confirmed live.
- P3 correction (region 404's *server* response carries neither layout nor
  panel; only hydration does) — consistent with the region 404 being served
  from Next's error shell (`RegionNotFound`'s own comment says the same thing)
  and with `curl`-style reasoning; not independently re-measured byte-for-byte
  but internally consistent across code comment, test comment, and report.
- Prefetch byte counts (6/8.4KB, +5/13KB, +28/86KB) and the contrast ratios
  (12.17/12.28 min) are production-only, one-time measurements from an earlier
  agent's browser session — not independently re-measurable without
  reproducing that exact session. Left as-is: they're correctly scoped as a
  measurement in a stateful report, not asserted as a durable doc claim
  elsewhere.
- `28 passed (was 24; +4 new)` — reran; current total is 28, and
  `routing.spec.js` alone has 16 tests, consistent with the arithmetic in the
  report (though I did not reconstruct which specific 4 tests were the "new"
  4 relative to a prior 24 — not verifiable without the intermediate git
  state).

No contradictions found between this report and the current docs — its one
correction (`%74phcm`, P3) already propagated into `docs/game-flow.md` and
`src/lib/regions.js` as the report itself says.

### 8. `CLAUDE.md` — no change needed

Checked against the new files (`InlineScript.js`, `global-setup.js`) and the
routing behavior change. None of `CLAUDE.md`'s existing rules (JS-only,
individual params, file-modification policy, generated-data ownership, client
safety for `pano-index.js`/`pano-db.js`) are contradicted or need a new
carve-out — `InlineScript.js` isn't a server-only lib like the two named, and
the region-path change doesn't touch any rule stated there. Conservative
choice: leave it alone.

## Unresolved questions

1. Should `phase-01-dynamic-route.md`'s two `DN-HOANGSA` mentions (lines 118,
   139) also be corrected to `TPHCM-CUCHI`, or left as a historical artifact
   since `plan.md`'s own "D3 rejected too" section already supersedes that
   phase file's assumptions? I lean toward fixing both for consistency, but
   didn't touch it since the task scoped this item to `plan.md`.
2. The report's prefetch/contrast numbers (finding #7) can't be re-verified
   without redoing a live browser measurement session — flagging as
   unverified-but-plausible rather than confirmed.
