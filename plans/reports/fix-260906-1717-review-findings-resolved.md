---
title: "Review findings resolved: feat/game-region-path-segment"
plan: plans/260906-1122-game-region-path-segment/plan.md
branch: feat/game-region-path-segment
date: 2026-09-06
status: DONE
sources:
  - plans/reports/code-reviewer-260906-1659-region-path-diff-review.md
  - plans/reports/tester-260906-1659-region-path-diff-tests.md
  - plans/reports/ui-ux-review-260906-1659-notfound-and-picker.md
---

# All review findings resolved

Six findings from the three 1659 reviews, plus three lows and the tester's nit.
Every one closed by a code change or by a measurement that settled it.

## Fixed

### M1 — `regionFromSlug` normalised where it should validate

`src/lib/regions.js`. `toUpperCase()` is full Unicode case mapping, so the
accepted set was every string uppercasing into a code, not just re-casings.
Added a round-trip guard: `regionSlug(code) === raw.toLowerCase()`.

Verified against the real tree, before and after:

| URL | uppercases to a real code | before | after |
|---|---|---|---|
| `hn-badınh` (U+0131) | `HN-BADINH` yes | 200, real round | **404** |
| `hn-ſontay` (U+017F) | `HN-SONTAY` yes | 200, real round | **404** |
| `TPHCM` | — | 200 | 200 |
| `hn-badinh` | — | 200 | 200 |

Uppercase URLs still serve 200 with no redirect, as designed. Covered by two
lines in `tests/regions.test.js` and one e2e case asserting the percent-encoded
request `GET /game/hn-bad%C4%B1nh` → 404.

### M2 — 85 pages, one shared title

`src/app/game/[region]/page.js` gained `generateMetadata`, resolving through
`regionFromSlug` and **not** `getRegion` — the trap the review named: `getRegion`
throws, metadata resolves before render, so an unguarded version turns the 404 at
`/game/notaregion` into a 500. An unresolved slug returns `{}` and inherits root
metadata; the page below still `notFound()`s.

Verified in the prerendered HTML:

```
.next/server/app/game/hn-badinh.html  <title>Ba Dinh — VNGeoGuessr</title>
                                      description="Guess where you are in Ba Dinh, Ha Noi, from street view."
.next/server/app/game/vn.html         <title>Vietnam — VNGeoGuessr</title>
```

Province named alongside the district because district names repeat across
provinces. Reveals nothing — the region is already in the URL.

### P2 — explanation line below AA

`NotFoundPanel.js`: `text-muted-foreground` → `text-foreground` (~15:1 vs the
measured 4.05:1 avg / 3.09:1 worst over `vn-surface`). The comment beside it
recorded a decision from the premise "near the AA floor"; rewritten to state the
measurement it actually sits on.

### P3 — region 404 centring unverified

Added the footer assertion to the region-404 e2e test. It passes.

**Corrected after the 1751 verification pass.** The first version of this entry
claimed the pass proved the region 404 renders inside the root layout. It does
not. Measured directly against `next start`:

| Request | Response | `Made by` | `No such region` |
|---|---|---|---|
| `/game/notaregion` | `<html id="__next_error__">`, 9.9 KB | 0 | 0 |
| `/nosuchpath` | root layout | 1 | 1 (`Page not found`) |

So the region 404's *server* response carries neither the layout nor the panel;
both arrive at hydration, which is what Playwright asserts. The assertion is
still worth keeping — it pins that the panel ends up in the layout — but it
cannot see first paint, and nothing in the suite can. Comments in
`routing.spec.js` and `[region]/not-found.js` corrected to say so; the latter
had called the cost "a light flash", where the real first paint is empty.

### P3 — "Go to the start"

`src/app/not-found.js`: → "Go to VNGeoGuessr". This 404 catches links from
outside the app, where no start has been seen. Test label updated.

### L1 — region 404 stopped following the OS

`game/[region]/not-found.js` applied the theme once on mount. Now subscribes via
the existing `watchSystemTheme`, as `ThemeToggle` does, and unsubscribes on
unmount.

### Tester's nit — 404 exits not verified to go anywhere

Both 404 tests now assert `href="/"` on the exit link, not just its visibility.

### L3, L5 — cosmetic

Duplicate `regions.js` import collapsed in `routing.spec.js`. Plan success
criteria corrected from `/game/VN` and `/game/{code}` to the shipped lowercase.

## Measured, then left alone

### P3 #4 — prefetch volume

The review asked for a measurement before touching this, because prefetch is
production-only and source reading cannot settle it. Measured against
`next start` on a real production build, counting requests carrying
`Next-Router-Prefetch: 1` / `RSC: 1`:

| Action | Prefetch requests | Bytes |
|---|---|---|
| Landing, settled | 6 | 8.4 KB |
| Expand Ha Noi (30 districts, 32 `/game/` links in DOM) | +5 | +13 KB |
| Expand 3 more provinces | +28 | +86 KB |
| **Total, heavy browsing** | **39** | **107 KB** |

The feared symptom — a burst of 85 on one expand — does not occur: prefetch
fires on **viewport entry**, so only the ~5 visible rows fetch, not the 30
mounted ones. ~2.7 KB each, against panorama images an order of magnitude
larger, buying an instant navigation on the picker's primary action.

**No change made.** `prefetch` stays at the default.

## Second pass: findings from the 1751 verification reviews

Three agents re-reviewed the fixes above. The guard was brute-forced against
`U+0080..U+10FFFF` for a character that uppercases into ASCII `[A-Z0-9-]` and
survives the round trip — **zero hits**, covering U+0131, U+017F, U+212A Kelvin,
U+1E9E and the ligature class; `toUpperCase`/`toLowerCase` are locale-independent
by spec, so a tr-TR locale cannot reintroduce İ/ı. `text-foreground` was
re-measured from the tokens rather than trusted: **light min 12.17, dark min
12.28**, 0% of pixels under 4.5:1, with an art-independent floor of ~12:1. The
new assertions were mutation-tested — reverting `regionFromSlug` fails both
homoglyph assertions; pointing both `actionHref` at `/broken` fails both href
assertions. What they found on top:

- **P3 claim was wrong** — corrected above.
- **`/game/%74phcm` returns 200.** Confirmed independently. The router decodes
  the segment before the page sees it, so `%74` arrives as `t`. Reading the raw
  form means `headers()`, which opts the route out of static rendering: 85
  prerendered pages traded away for a hand-crafted URL nothing links to.
  **Behaviour kept; the wording that denied it was the defect.** `regions.js`
  and `docs/game-flow.md` now scope the claim to what the function controls.
- **`theme.js` JSDoc was false for its new second caller** — "fires only while
  following the system" described `ThemeToggle`'s gating, not the function.
  Rewritten to state the real contract.
- **`eslint.config.mjs` ignores** now cover `test-results/` and
  `playwright-report/`. Gitignored but eslint walked them, and a lint run
  concurrent with a test run crashed on files the reporter was still writing.
- Two comment-accuracy nits fixed: the metadata comment said "Outermost first"
  where the output is narrowest-first, and the contrast comment stated
  light-theme ratios as if universal (dark measures 5.8–9.2:1).

Not changed: the root layout's `"GeoGuessr for VietNam"` differs from the tree's
`"Vietnam"`, but it is pre-existing on `main` and outside this diff.

## Third pass: the console error, and the flake it exposed

A runtime sweep (the review type missing from both earlier passes — all five
prior agents read source and none drove a browser) plus a full re-review.

### The console error the user hit

`Encountered a script tag while rendering React component` at `layout.js:52`,
on `/game/notaregion` only. Isolated by capturing console output per route:
`/`, `/game/tphcm` and `/nosuchpath` were all silent.

Cause: a thrown `notFound()` is served from Next's error shell, so React renders
the root layout **on the client** — the only route where that happens. React
warns because a script created through the DOM never executes, and per
`react-dom`'s `isScriptDataBlock`, the warning is suppressed only for a
non-executable `type`. Ours had no `type` at all. The same root cause as the
empty first paint: the script really is dead there, which is why the theme
`useEffect` exists.

Fixed with `src/app/components/InlineScript.js`, from Next's own
"preventing flash before hydration" guide: `text/javascript` on the server,
`text/plain` on the client. **It must be a Client Component** — applied as a
Server Component first, the ternary is evaluated once on the server, baked into
the RSC payload, and the warning persists. Measured both ways.

Result: executable on every normally-rendered route, inert only where React
client-renders it. Zero warnings; the pre-paint theme still runs.

### Two tests added, both mutation-proven

- `renders without a console error` — fails with the exact message when the
  helper is reverted. Filters the browser's own `Failed to load resource` line
  for the 404 response, which is the point of the page.
- `the pre-paint theme script is served executable` — closes a gap the tester
  found: mutating the helper to always emit `text/plain` broke the pre-paint
  script and **no test noticed**, because `ThemeToggle` re-applies the theme on
  mount, so `<html>` ends up correct either way — just a flash later. Asserted
  on raw HTML, with no browser, since in a browser the regression is invisible.

### The e2e lane was flaky, deterministically

Two agents reported a block of 8 routing failures; I had dismissed it as agent
contention after my own clean runs. Both of us were half right — it reproduces
**on demand** with no agents running:

```
touch any source file; npx playwright test   ->  8 failed, 20 passed
```

Always the same 8 — every test that navigates to a `/game/*` URL — each at the
60s timeout. `next dev` compiles a route on first request; 8 workers demand the
same cold compile at once and all wait past the limit. Pre-existing (the config
comment anticipates it) but worsened here: `/game` became 85 SSG pages plus a
dynamic route.

Fixed at the cause with `tests/e2e/global-setup.js`, one serial warm-up pass
over the game routes. Same trigger now: **28 passed, 47s** (from 1.6m).

## Gates

| Gate | Result |
|---|---|
| `npm test` | 268 passed (19 files) |
| `npm run lint` | 0 errors, 19 warnings (all pre-existing, none in changed files) |
| `npm run build:check` | clean, 101/101 pages, 85 SSG region pages, per-region titles present. NB: bare `next build` exits 0 when a dev server holds `.next` — that gate can pass without building |
| `npx playwright test` | **28 passed** (was 24; +4 new), green at default parallelism |

## Not addressed, deliberately

- **L2** — the `home.spec.js` / `username.spec.js` drift repairs from `6251ea5`
  are unrelated to this feature and widen the diff. They are correct and test
  real behaviour; unpicking them now would be churn. Noted for the lead.
- **L4** — `NotFoundPanel` exists against the earlier ui-ux recommendation not
  to abstract two eight-line panels. Both reviewers called the reversal
  defensible; not reopened.
- Tab title on the 404s themselves stays "VNGeoGuessr" — `not-found.js` cannot
  export `metadata`; only `global-not-found.js` can, at the cost of an entire
  duplicate shell.

## Docs

`docs/game-flow.md` gained two bullets under the URL-shape section: the
re-casing-only rule, and per-region titles. Both are user-visible behaviour.

## Unresolved questions

One, for the lead rather than blocking: the region 404's empty first paint could
be removed by having `[region]/page.js` render the panel itself with a 404
status instead of throwing `notFound()`, which would prerender it inside the
root layout the way `/nosuchpath` already is. That trades the framework's
`not-found` convention for a hand-rolled status, on a page reached by typos.
Left as-is; raising it because the measurement is now on record.

The two items the first-pass reviews flagged as needing the author's call (M1's
guard, the contrast class) were resolved in the direction the reviews
recommended, on the instruction to solve all issues. The 1751 pass's own two
questions are answered above: the `%74phcm` family is accepted with the wording
corrected, and the P3 claim is retracted.
