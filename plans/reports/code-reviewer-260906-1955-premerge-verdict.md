# Pre-merge verdict — `feat/game-region-path-segment` @ 76e72c0

Base `origin/main` @ 90ebed7. 9 commits, 55 files, +6845/-78 (source: 20 files,
~+430/-78; the rest is `docs/`, `plans/`, `.claude/agent-memory/`).

## Verdict

**MERGE.** All four gates green on the pushed tree. Zero Critical, zero High.
Two Low/informational notes below, neither worth holding the merge for.

The four findings from the 1935 pre-commit pass are all resolved in this tree
(verified, not assumed): `tests/e2e/global-setup.js:32` now `console.warn`s the
failed warm-up; `:22` bounds the fetch with `AbortSignal.timeout(60_000)`;
`tests/e2e/routing.spec.js:142` asserts `headEnd > 0` before slicing;
`docs/project-structure.md:167-170` documents `global-setup.js`.

## Gates — real output, this tree

| Gate | Result |
|---|---|
| `npm test` | **268 passed**, 19 files, 3.91s, exit 0 |
| `npm run lint` | **0 errors, 19 warnings**, exit 0 — all 19 are the pre-existing `react-hooks/set-state-in-effect` set |
| `npm run build:check` | exit 0. **101/101** static pages in 1190ms. `/game/[region]` `●` SSG **85 paths**; `/game` `ƒ`; TypeScript pass |
| `npx playwright test` | **28 passed** in 16.3s, exit 0 (adopted the pre-existing dev server on :3000, PID 34228 — reused, not restarted, not killed) |

Matches the stated baseline exactly on all four.

## 1. Merge readiness — clean

- **No debug leftovers in the diff.** The three `console.log`s in the tree
  (`src/app/api/debug/mapillary/route.js:44`, `src/app/api/guess/route.js:93`,
  `src/app/api/new-game/route.js:120`) are all pre-existing and outside
  `git diff origin/main...HEAD`.
- **No `TODO`/`FIXME`/`XXX`/`HACK`/`TEST:`/`debugger;`** anywhere in `src/` or
  `tests/`. No commented-out code blocks in the diff.
- **No secrets.** Scanned every changed file for connection strings, bearer
  tokens, `sk-`/API-key shapes, `DATABASE_URL=`, `NEON_`, `MAPILLARY_*=`: zero
  hits. The two new `.claude/agent-memory/debugger/*.md` files contain only
  runtime observations and report links.
- **No stray files.** Every path in the diff falls under `src/`, `tests/`,
  `docs/`, `plans/`, `.claude/agent-memory/`, `eslint.config.mjs`,
  `playwright.config.mjs`. No build artifacts, no dotenv, no editor files.
  `.claude/agent-memory/` and `plans/reports/*` are the repo's tracked
  convention — not objected to.
- **No stale `?region=` links in shipped code.** Remaining occurrences are only
  in `tests/e2e/*` (asserting the legacy redirect *works*), `tests/*.test.js`
  (API routes, which deliberately keep query params), and `docs/` prose.
  `useSearchParams` has zero remaining call sites in `src/`.

## 2. Commit history — accurate, no overclaims

Conventional format throughout, no AI references, bodies explain intent and
rejected alternatives. I fact-checked the load-bearing claims rather than
reading them:

| Claim | Verification |
|---|---|
| 45cb389: `hn-badınh` (U+0131) and `hn-ſontay` (U+017F) "both resolved and played a real round" | `HN-BADINH` and `HN-SONTAY` are real, playable codes. `regionFromSlug` returns `null` for both spellings now, `HN-BADINH` for the ASCII form. CONFIRMED |
| 45cb389: "`/game/TPHCM` still plays" | `regionFromSlug('TPHCM')`/`('TpHcM')` → `TPHCM`; `curl /game/TPHCM` → 200. CONFIRMED |
| 45cb389: the round trip accepts a re-casing "and nothing else" | All 85 codes satisfy `regionFromSlug(regionSlug(c)) === c`, and all 85 slugs are `encodeURIComponent`-identity. CONFIRMED |
| 1a989b0: per-region title/description on the prerendered pages | Served HTML: `/game/tphcm` → `Ho Chi Minh — VNGeoGuessr`; `/game/hn-badinh` → `Ba Dinh — VNGeoGuessr` + `…in Ba Dinh, Ha Noi…`; `/game/vn` → `Vietnam — VNGeoGuessr` (country falls back to `name`, no empty `place`). Ran the exact `generateMetadata` expression over all 85: 0 failures, 0 `undefined`/`null`. CONFIRMED |
| f116fec: "the production prerender still carries the executable script" | `.next-check/server/app/{index,_not-found,game/tphcm}.html` each: 1× `type="text/javascript"`, 0× `text/plain`. CONFIRMED |
| 6d7cb30: "an unmatched path prerenders inside the root layout, footer and script included" | `curl /nosuchpath`: 1× `type="text/javascript"`, `Made by` footer present, no `__next_error__`. `curl /game/notaregion`: `__next_error__` present, 0 executable scripts, no footer. Both halves CONFIRMED |
| 76e72c0: "`DN-HOANGSA` … is not a region at all"; "`TPHCM-CUCHI` is the fixture actually tested" | `isRegion('DN-HOANGSA')` → false. `isRegion('TPHCM-CUCHI')` → true, `isPlayable` → false. The plan correction is right. CONFIRMED |
| bc32de2: "watchSystemTheme's contract was documented as its caller's gating rather than its own behaviour" | `src/lib/theme.js:85-88` subscribes unconditionally — the new doc is accurate. Both callers are correct: `ThemeToggle.js:37` returns early unless `theme === 'system'`; `game/[region]/not-found.js:34` re-applies `getStoredTheme()`, a no-op for an explicit choice. No masked bug. CONFIRMED |
| 711ef86: "no longer needs useSearchParams or its Suspense boundary" | Zero `useSearchParams` in `src/`. CONFIRMED |
| `docs/project-structure.md`: "The 85-node tree" (was 67) | `allRegions().length === 85`. CONFIRMED |

Thematic grouping over strict bisect-greenness is acceptable here: the repo is
single-author and linear, has no bisect tooling in `scripts/`, and each commit
is a coherent behavioural unit whose body explains why. **No message claims
something the diff does not do** — the failure mode you asked me to hunt is
absent.

## 3. Cross-cutting correctness of the union — no defect found

The interaction you flagged — `InlineScript` + `generateMetadata` + `notFound()`
+ the theme effect on one render path — I probed rather than reasoned about:

- **`InlineScript` as a client component in the server root layout's `<head>`
  does not leak the client boundary.** `children` is still passed as a prop, so
  no page becomes client-rendered. Build confirms: `/`, `/credits`, `/debug*`
  still `○` static, `/game/[region]` still `●` SSG ×85.
- **The `type` ternary produces the right value on every surface.** Dev and
  production prerender both serve exactly one `type="text/javascript"` and zero
  `text/plain` on `/`, `/nosuchpath`, `/game/tphcm`. The error shell at
  `/game/notaregion` serves zero executable scripts — the documented, accepted
  shape.
- **The RSC payload now carries a second copy of the theme script as a prop
  string** (`classList.toggle` appears 2× per document, was 1× when the script
  was rendered by a pure server component). It is inert JSON data, contains no
  interpolated user input (`THEME_STORAGE_KEY` is a module constant), and costs
  a few hundred bytes. Not a defect — recorded so it is not re-discovered as one.
- **`generateMetadata` cannot 500 the 404.** `regionFromSlug` returns `null`
  before `getRegion` is reached, `{}` is returned, and the page still
  `notFound()`s — verified end to end: `/game/notaregion` → 404,
  `/game/hn-bad%C4%B1nh` → 404.
- **Both 404 exit links actually navigate**, which the e2e only asserts by
  `href`. Driven in a real browser: `/game/notaregion` → click "Pick a region" →
  lands on `/` with the home page rendered, zero console errors and zero page
  errors; `/nosuchpath` → "Go to VNGeoGuessr" → same. The error-shell router is
  functional, so the "one way out" is real and not just present in the DOM.
  (My first probe appeared to show it stuck — that was clicking before
  hydration, i.e. the already-accepted empty-first-paint window, not a defect.)
- **The theme effect does not fight `ThemeToggle`.** They are never mounted
  together (`ThemeToggle` is on neither 404), and the not-found's
  `watchSystemTheme` unsubscribes on unmount, so the soft nav out to `/` leaves
  no orphan listener and no palette reset.
- **`key={code}` remount rationale holds.** `GameClient`'s init effect
  early-returns on `initialized`, so a bare prop change genuinely would leave
  the previous region's round on screen. The key is the correct one-word fix.
- **No new prefetch load from the route-shape change.** A concern worth checking
  — 85 distinct `Link` destinations where there used to be one route — but the
  landing page renders exactly **1** `/game/` anchor until a province is
  expanded. Measured: 0 `/game*` network requests on a settled `/`.

## 4. Regression risk to existing behaviour — none identified

- **Game flow.** `GameClient`'s only behavioural change is where `region` comes
  from. `loadRound`, `startPrefetch`, the epoch/watchdog machinery and
  `applyRound` are untouched. `locationCode.toUpperCase()` at
  `src/app/components/GameClient.js:154` is now a no-op (the page hands over a
  canonical code) but is harmless and keeps the function callable with any casing.
- **"Continue in …" (last region).** Intact end to end: written at
  `GameClient.js:161` behind `loaded && isRegion(code)`, read at
  `RegionPicker.js:130` behind `isRegion(code) && isPlayable(code)` — so a stale
  or invalid localStorage value cannot reach the throwing `getRegion` on line 140.
- **Username modal.** `src/app/page.js` still routes through
  `handlePlayClick(href)` → `pendingHref` → `router.push`, and the only href
  producer is `RegionPicker.js:53`, which now emits `/game/{slug}`. No path
  builds a URL by hand. Covered by 4 passing e2e specs.
- **Leaderboard and debug routes.** Zero files touched; no route builds a
  `/game` URL. `/api/*` query params unchanged, as `docs/game-flow.md:49-52`
  now states explicitly.
- **Trust boundary intact.** `src/app/game/[region]/page.js` imports only
  `lib/regions.js` and `GameClient` — never `pano-index.js`/`pano-db.js`. The
  `tests/regions.test.js` client-import walk auto-discovers the two new
  `"use client"` files (`InlineScript.js`, `game/[region]/not-found.js`), so
  they are already inside the guard.
- **Hostile legacy input is contained.** `encodeURIComponent` at
  `src/app/game/page.js:51` neutralises CRLF header injection and `../` path
  escape; both land on the honest 404, asserted by `routing.spec.js:89-99` and
  re-confirmed by curl. `firstValue` matches the old
  `searchParams.get()`-first-value semantics exactly for the repeated-key and
  empty-value cases, so no link changes meaning across the migration.

## Findings

### 1. `src/app/game/page.js:51` — legacy redirect is 307, not 308 — LOW, CONFIRMED

`redirect()` emits a temporary redirect (measured: `curl /game?region=HN` →
`307 → /game/hn`). The region moved into the path permanently, so search engines
and clients keep treating `/game?region=X` as a live canonical URL and
re-request it indefinitely.

No analytics impact — the redirect is server-side, so the Vercel script never
runs on `/game` and no phantom row is created. Purely an SEO/crawl-budget nit.

Minimal fix if wanted: `import { permanentRedirect } from 'next/navigation'` and
swap the call. Trade-off to weigh first: browsers cache a 308 per full URL
indefinitely, so any future change to `?region=` semantics would be sticky for
anyone who hit the old URL once. Given the docs promise these links are "kept
for links and bookmarks already in the wild", 307 is defensible.
**Recommendation: leave it.** Recorded so it reads as a decision, not an oversight.

### 2. `src/app/not-found.js` — the app-wide 404 has no title — LOW, CONFIRMED

`curl /nosuchpath` and `curl /game/notaregion` both serve
`<title>VNGeoGuessr</title>`. This branch's own argument (1a989b0) is that the
tab, the history entry and the bookmark should say what the page is; the two
404s are the one place that argument was not applied.

The region 404 cannot be fixed — it is served from Next's error shell, which
carries no metadata. The app-wide one can, in one line:

```js
export const metadata = { title: 'Page not found — VNGeoGuessr' };
```

Cosmetic, non-blocking. Fixing only one of the two arguably makes the
inconsistency more visible rather than less.

## Not re-reported

Per the brief: Windows ISR case-folding; debug routes in prod; `NotFoundPanel`'s
existence; the bundled 6251ea5 e2e drift; `/game/%74phcm` → 200; unknown-region
URLs minting year-long ISR entries; root layout "GeoGuessr for VietNam"; the 19
pre-existing lint warnings; the region 404's empty first paint.

I did re-verify the drift repairs strengthen rather than weaken:
`tests/e2e/home.spec.js:38-56` now asserts the sha link's accessible name, its
short-form text, the full-40-hex href *and* the copied clipboard value, where it
previously asserted one element's text; `tests/e2e/username.spec.js` gained a
`dialog` hidden assertion and a post-save Play navigation where it previously
stopped at the URL. `tests/regions.test.js:30-64` adds three real assertions
(URL-safety across all 85, round-trip across all 85, and the two homoglyph
rejections) — not phantom tests: the homoglyph cases fail against the
pre-45cb389 implementation by construction.

## Process

Reused the pre-existing dev server on :3000 (PID 34228) via
`reuseExistingServer`; started no long-running process; killed nothing. All
background commands exited. No files modified except this report.

## Unresolved questions

1. **`/game/notaregion` returns 404 in dev and under the e2e lane; it is not
   verified against a real production ISR runtime.** `next start` on this box is
   unreliable for exactly this (case-folded cache keys), so the first honest
   check is a Vercel preview. Standard Next behaviour makes a cached 404 the
   expected outcome, and the ISR-entry cost is already a recorded decision — I
   would merge without it, but a one-URL smoke on the preview deployment closes it.
2. **Neither import-walk test covers server components.**
   `src/app/game/[region]/page.js` could grow a `pano-db` import without failing
   a test. Pre-existing gap, unchanged by this branch, out of scope here —
   flagging only because the branch added the first non-`api/` server component
   that takes user input.
