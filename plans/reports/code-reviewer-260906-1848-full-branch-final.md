---
title: "Full branch correctness review: feat/game-region-path-segment (3 commits + working tree)"
plan: plans/260906-1122-game-region-path-segment/plan.md
branch: feat/game-region-path-segment
date: 2026-09-06
status: DONE_WITH_CONCERNS
verdict: SAFE TO COMMIT (after removing 3 untracked scratch files not part of this change)
sources:
  - plans/reports/fix-260906-1717-review-findings-resolved.md
  - plans/reports/code-reviewer-260906-1751-applied-fixes-verification.md
---

# Full branch review

Reviewed as one deliverable: commits `711ef86`, `ae0cc3d`, `6d7cb30` plus the
13-file working tree and the new untracked `src/app/components/InlineScript.js`.
Focus on the surface the prior pass did not see (InlineScript + layout wiring,
the new console-error e2e test); the four recommended actions from
`code-reviewer-260906-1751` are all applied and re-verified below.

**No Critical or High findings. No blocking defect in the change itself.**

## Gates actually run

| Gate | Result |
|---|---|
| `npm test` | **268 passed**, 19 files, 12.1s, exit 0 |
| `npm run lint` | **0 errors, 19 warnings**, exit 0 — all warnings pre-existing `react-hooks/set-state-in-effect`, none in a changed file |
| `npm run build` | **substituted** — see caveat. `npm run build:check` (same `next build`, `NEXT_DIST_DIR=.next-check`): **clean**, Next 16.3.3 Turbopack, 101 static pages, `/game/[region]` SSG **x85** |
| `npx playwright test --workers=1` | **27/27 passed**, 39.7s |
| `npx playwright test` (default workers) | **FAILED both attempts** — see M2 |

Build caveat: a `next dev` on :3000 (PID 33376) that this session does not own
holds `.next`, so `next build` aborts with "Another next build process is
already running" — and **exits 0 while doing so**, which is a gate that can pass
without building. `npm run build:check` is the repo's own answer to that
(`next.config.mjs` `distDir` switch) and produced a real build.

Process hygiene: I started one `next start -p 3100` from `.next-check` and
terminated it (PID 39448, port confirmed free). The :3000 dev server was
reused, never touched.

**Measurement disturbance, not a defect:** mid-review a concurrent session ran
`git stash push -u` on this tree, then popped it. My first full e2e run raced
that window (specs loaded from the working tree, dev server serving `HEAD`), so
its 2 failures are invalid. All results above are from after the tree was
restored; `git diff --stat` re-confirmed identical (13 files, +168/-24) before
writing this.

---

## Priority 1 — `InlineScript.js` + `layout.js`: CLEAN, and stronger than the comments claim

`src/app/components/InlineScript.js:26-34`, `src/app/layout.js:53`.

The highest-stakes question — "does the theme script stop executing on a hard
load" — is **CONFIRMED NO**, four independent ways:

1. **Production HTML, all pages.** Swept every prerendered `.html` in
   `.next-check/server/app`: 94 files, of which **91 carry
   `<script type="text/javascript">` with the theme body inside `<head>`, and 0
   contain `text/plain`**. The 3 without it are `_global-error.html` (stock
   Next) and two on-demand 404 shells — exactly the case
   `game/[region]/not-found.js` compensates for.
2. **Bundle-level.** Turbopack constant-folds the ternary per environment. The
   client chunk contains the literal
   `function({html:e}){return jsx("script",{type:"text/plain",suppressHydrationWarning:!0,dangerouslySetInnerHTML:...` (`.next-check/static/chunks/1s8hr70_3uv3j.js`)
   — no runtime `typeof window` check survives, so there is no path by which the
   server branch could pick `text/plain`.
3. **Post-hydration DOM, `next dev` (React dev warnings live).** Loaded `/`,
   `/credits` and `/game/tphcm` with `vngeoguessr_theme=dark`, and `/` with
   `light`:

   | path | stored | `html.className` | `colorScheme` | head script `type` | console errors/warnings |
   |---|---|---|---|---|---|
   | `/` | dark | `dark` | `dark` | `text/javascript` | none |
   | `/credits` | dark | `dark` | `dark` | `text/javascript` | none |
   | `/game/tphcm` | dark | `dark` | `dark` | `text/javascript` | none |
   | `/` | light | `` | `light` | `text/javascript` | none |

   React does **not** patch the attribute to `text/plain` during hydration, and
   `suppressHydrationWarning` does cover the type mismatch — zero warnings.
4. **Head placement unchanged.** The script sits inside `<head>` (idx 2806,
   `</head>` at 3269 on `/`). React 19 only hoists `<script>` with `src`;
   an inline `dangerouslySetInnerHTML` script renders in place. Position within
   `<head>` is immaterial anyway: it sets a class on `<html>` and the browser
   paints nothing until `</head>` plus render-blocking CSS.

**CSP: no implication.** No `middleware.js`, no `vercel.json`, no `headers()` in
`next.config.mjs`, no CSP anywhere in `src/`. This change does not add an inline
script — it rewraps the one that already existed — so even under a future CSP
the nonce work is identical to before.

**Streaming/payload:** the theme string appears twice in each HTML document (the
executable tag plus the flight payload). That is not new — a Server Component
rendering the same host element serializes its `__html` into the RSC payload
too. No size regression observed.

**Informational (not a defect):** making `InlineScript` a `"use client"` module
imported by the Server Component root layout is a deliberate deviation from the
Next guide, where `InlineScript` is a plain module imported *by* a Client
Component. The JSDoc at `InlineScript.js:6-10` states the reason and my
measurements agree with it. Consequence worth knowing: on any future
`error.js` / `global-error.js` path the layout is client-rendered, so the
pre-paint script is inert there too and that page will show the light palette
unless it re-applies the theme the way `game/[region]/not-found.js:31-34` does.
Not a regression — the script never executed on those paths before either; the
change only silences the warning that used to advertise it.

## Priority 2 — `regionFromSlug` round-trip guard: CORRECT

`src/lib/regions.js:81-86`.

- All 85 codes match `/^[A-Z0-9-]+$/`, `code.toLowerCase().toUpperCase() === code`
  for all 85, and there are **0 slug collisions** (85 codes → 85 distinct
  lowercase slugs). For any pure-ASCII input the guard is therefore a tautology:
  it cannot wrongly reject a legitimate re-casing.
- Live on the production build: `/game/TPHCM` **200**, `/game/hn-bad%C4%B1nh`
  (dotless i) **404**. Unit tests cover dotless i and long s.
- The prior pass brute-forced `U+0080..U+10FFFF` for a residual bypass and found
  zero. Not re-run; no new evidence to overturn it.
- The comment's percent-encoding caveat (`regions.js:67-72`) and the matching
  `docs/game-flow.md` bullet are now accurate — `/game/%74phcm` does return 200,
  which I re-confirmed, and both texts say so.

## Priority 3 — `generateMetadata`: CANNOT THROW

`src/app/game/[region]/page.js:40-56`.

- `regionFromSlug` guard precedes `getRegion`, so the throwing call is
  unreachable for an unknown slug; `return {}` at line 44 inherits root
  metadata. `/game/notaregion` returns **404, not 500**, in dev and in the
  production build.
- `params` is awaited (Next 16 Promise shape). No `metadata` export in the same
  segment. Server Component. Matches Next 16.3.3.
- `regionPath(code).slice(1).reverse().join(', ') || name` read out of the real
  prerendered HTML: `game/hn-badinh.html` → `Ba Dinh — VNGeoGuessr` /
  "Guess where you are in Ba Dinh, Ha Noi, from street view."; `game/vn.html`
  exercises the `|| name` fallback.
- **No data exposure.** `regionPath` names only ancestors of the region already
  in the URL; the answer is a panorama *inside* it. No `pano-index.js` /
  `pano-db.js` reach; all three helpers are sync tree lookups, so no N+1 and the
  85 pages still prerender.

## Priority 4 — theme effect in `game/[region]/not-found.js`: CORRECT

`src/app/game/[region]/not-found.js:31-34`.

`reapply` is declared inside the effect and re-reads `getStoredTheme()` on every
call — no stale closure. `applyTheme` is idempotent (`classList.toggle(_, bool)`
plus a direct assignment), so mount-apply followed by an OS flip cannot
double-apply. The unsubscribe is returned from the effect, so a client
navigation away removes the listener. `src/lib/theme.js:77-80` JSDoc now
describes what the function does rather than what `ThemeToggle` does with it,
which was the prior pass's finding — resolved.

## Priority 5 — `eslint.config.mjs` ignores: CORRECT

`eslint.config.mjs:8-16`. Global-ignores form (an `ignores`-only object) is the
right flat-config shape. `test-results/` and `playwright-report/` are both in
`.gitignore`, so nothing tracked is now unlinted. `npm run lint` completed
cleanly while a Playwright run was writing artifacts — the crash the comment
describes is fixed.

---

## Medium

### M1 — every unknown `/game/<anything>` mints a year-long cache entry and a blocking server render (CONFIRMED mechanism, PLAUSIBLE impact)

`src/app/game/[region]/page.js:19` (`generateStaticParams`), no `dynamicParams`
export. Measured against the production build on `next start`:

```
GET /game/zzznotaregion
  x-nextjs-cache: MISS
  x-nextjs-prerender: 1
  Cache-Control: s-maxage=31536000
```

and the render was **persisted to disk** — `.next-check/server/app/game/notaregion.html`
and `.next-check/server/app/game/hn-badınh.html` were created by my probes.
`prerender-manifest.json` shows `/game/[region]` with `compute: "blocking"` and
`initialRevalidateSeconds: false`. Next's own docs confirm the default:
"With `dynamicParams` set to `true` (the default), when a route segment is
requested that hasn't been generated, it will be server-rendered **and cached**."

Failure scenario: a crawler or a bored visitor walks `/game/aaaa`, `/game/aaab`,
… Each distinct URL is one blocking Function invocation and one CDN entry held
for a year. This is a **new** surface — before this branch `/game` was a single
static page and every unknown region collapsed onto it; `/game/[region]` is the
app's first dynamic route.

Severity is Low in absolute terms (the render is a hash lookup plus
`notFound()`; Vercel's cache evicts), but it is worth an explicit decision
because it is the same duplicate-URL argument that justified the case guard.

**Trade-off, not a directive.** `export const dynamicParams = false` closes it
completely (unknown params 404 without rendering or caching), but it would also
kill the deliberate "`/game/TPHCM` plays rather than redirecting" decision
recorded in `docs/game-flow.md` and asserted at `routing.spec.js:69`. Accepting
M1 as-is is a legitimate choice; it just should be a choice.

### M2 — `npx playwright test` at default parallelism is not a reliable gate (CONFIRMED, reproduced twice)

| Run | Workers | Result |
|---|---|---|
| 1 | default (~15) | 2 failed — invalid, raced the concurrent `git stash` |
| 2 | default (~15) | **8 failed**, 19 passed (1.9m) |
| 3 | `--workers=1` | **27 passed** (39.7s) |

Run 2's failures are all first-navigation-into-`/game` tests
(`routing.spec.js:40,45,50,57,62,69,80` and `username.spec.js:19`), landing on
`/` instead of the destination. Server-side behaviour is provably fine — probed
live during the same window, `/game?region=TPHCM` → **307 → /game/tphcm** and
`/game` → **307 → /game/vn**. So this is contention between `fullyParallel: true`
and a single reused Turbopack dev server, not a product defect. The prior pass
hit the same thing and also had to drop to `--workers=1`.

This branch adds 14 tests to that lane, so the flake rate goes up with it. The
acceptance criterion "27 e2e green" is only reproducible serially. Consider
`workers: 1` (or `workers: process.env.CI ? undefined : 2`) in
`playwright.config.mjs`, or document `--workers=1` for local runs — otherwise
the next person reads 8 red tests as a regression in this change.

## Low

### L1 — three untracked, non-gitignored scratch files sit in the repo root (CONFIRMED)

`tmp-sweep.mjs`, `tmp-prod-tphcm.mjs`, `tmp-prod-tphcm2.mjs`. `git check-ignore`
returns nothing for them, so `git add -A` before committing would land another
session's Playwright scratch scripts in this commit. They are not part of this
change. Delete or ignore them before staging. (`git commit -a` would not pick
them up, but `git add -A` / `git add .` would.)

### L2 — an uncovered region now advertises a round it cannot serve (informational, carried forward)

`/game/dn-hoangsa` gets `description: "Guess where you are in Hoang Sa, Da Nang,
from street view."` while the page renders the no-coverage panel. Consistent
with the deliberate `allRegions()` (not `playableRegions()`) choice at
`page.js:19`, and search engines see the same page a visitor does. Flagged by
the prior pass, still true, no action implied.

## Checked and clean

- **Backwards compatibility.** `?region=` and `?location=` both redirect in one
  hop, lowercased, with no query carried through (`routing.spec.js:40-87`, all
  green serially). `/api/new-game?region=`, `/api/leaderboard?region=` and the
  debug routes keep their query params — `grep` confirms `fetchNewRound`
  (`GameClient.js:31-34`) and `LeaderboardModal.js:41` are untouched. No
  `useSearchParams` remains anywhere in `src/`.
- **Trust boundary.** `src/lib/regions.js` still imports only the generated tree
  and counts; no client component reaches `pano-index.js` / `pano-db.js`. The
  new SSG pages embed region names only. `tests/regions.test.js` still enforces
  the boundary and passes.
- **Unsafe input.** The legacy value goes into a `Location` header via
  `encodeURIComponent` (`game/page.js:51`); CRLF and `../` both end at 404, not
  500 (`routing.spec.js:89-99`).
- **Error propagation.** `getRegion` is the only thrower on these paths and both
  call sites are guarded. `notFound()` is the intended control-flow throw.
- **Concurrency / state mutation.** `key={code}` on `GameClient`
  (`page.js:82`) forces a remount on region-to-region navigation, which is the
  right answer given the `initialized` guard. Theme effect subscription is
  balanced. No shared mutable state introduced.
- **Docs.** `docs/game-flow.md`, `docs/project-structure.md` and
  `docs/development.md` all match the code as it now stands, including the
  percent-encoding caveat and the InlineScript description.
- **Tests are load-bearing.** The prior pass proved the `href` assertions fail
  under mutation. The new console-error test at `routing.spec.js:134-151` is
  meaningful only against `next dev` (React's script warning is dev-only) —
  which is what the lane runs, so that is correct, not a phantom.

## Recommended actions

1. Remove `tmp-sweep.mjs`, `tmp-prod-tphcm.mjs`, `tmp-prod-tphcm2.mjs` from the
   repo root before staging (L1). Blocking only in the sense that they must not
   be in the commit.
2. Decide M1 explicitly: accept unbounded `/game/<unknown>` cache entries, or
   set `dynamicParams = false` and give up the uppercase-URL-plays behaviour.
   Do not change it silently either way — both sides are recorded decisions.
3. Make the e2e lane deterministic (M2), or note `--workers=1` in
   `docs/development.md` next to the existing Playwright paragraph.
4. Verify the build gate on a machine where `.next` is free, or switch the
   documented gate to `npm run build:check` — `next build` exits 0 when it
   refuses to run.

## Metrics

- Type coverage: N/A (JavaScript-only project by CLAUDE.md; `next build` runs
  its own TS pass in 325ms with no sources to check).
- Unit tests: 268 passing, 19 files.
- E2E: 27 passing serially; 19/27 at default parallelism.
- Lint: 0 errors, 19 warnings, 0 in changed files.
- SSG: 85 region pages, 101 static pages total.

## Unresolved questions

1. M1: is a year-long CDN entry per unknown `/game/*` URL acceptable, given the
   duplicate-URL cost argument used to justify the case guard? The only clean
   fix conflicts with the accepted uppercase-URL behaviour.
2. The prior pass's open question stands and this pass did not change it: the
   region-404's first paint is an empty error shell (no heading, no exit, no
   footer) until hydration. Rendering the panel from the page with a 404 status
   instead of throwing `notFound()` would prerender it inside the root layout —
   and would also make `InlineScript` unnecessary. Out of scope here; worth a
   decision before more 404 surfaces are added.
3. Who owns the concurrent session editing this tree? It stashed and popped the
   working tree mid-review and is running scratch scripts against :3000. Nothing
   in this report depends on it, but a commit taken while it is mid-experiment
   could capture a state nobody reviewed.
