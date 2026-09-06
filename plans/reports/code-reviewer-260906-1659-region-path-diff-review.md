---
title: "Code review: feat/game-region-path-segment vs main (post-6d7cb30)"
plan: plans/260906-1122-game-region-path-segment/plan.md
branch: feat/game-region-path-segment
reviewed: 2026-09-06
status: DONE_WITH_CONCERNS
---

# Code review: region path segment, current tree

Second-pass review. Everything the 1237 review raised (H1 unencoded redirect
target, M1 stale JSDoc, M2 missing `key`, M3 no `not-found`) is fixed in the
committed tree — verified line by line, not taken on trust. This report covers
only what is still true, plus the surface introduced by `6d7cb30`.

## Scope

- `src/`: `game/page.js`, `game/[region]/page.js`, `game/[region]/not-found.js`,
  `not-found.js`, `components/NotFoundPanel.js`, `components/GameClient.js`,
  `components/RegionPicker.js`, `lib/regions.js`
- `tests/`: `regions.test.js`, `e2e/{routing,game,home,username}.spec.js`
- Ran: `npm test` (19 files, 268 tests, green), `npm run lint` (0 errors,
  19 warnings, none in changed files), `npm run build:check` (clean;
  101 static pages, `/game/[region]` = 85 SSG, `/game` = f dynamic)

## Verdict

No critical or high findings. Two medium items worth a decision before this is
called done; both are consequences of the migration rather than defects in it.

## Medium

### M1 — `regionFromSlug` normalises where it should validate (CONFIRMED)

`src/lib/regions.js:68-71`

```js
const code = String(slug).toUpperCase();
return isRegion(code) ? code : null;
```

The doc comment above it (`:59-64`) frames the accepted input set as "casing".
It is not. `String.prototype.toUpperCase` is full Unicode case mapping, so the
accepted set is *every string whose uppercase equals a region code*. Verified
against the real tree, not reasoned about:

```
regionFromSlug('hn-badınh')  ->  'HN-BADINH'     // U+0131 dotless i
```

`long s` (U+017F) maps to `S` the same way, so `hn-<U+017F>ontay` also resolves;
5 codes contain `S` and 5+ contain `I`.

Failure scenario: `GET /game/hn-bad%C4%B1nh` returns **200** and plays a real
Ba Dinh round. On Vercel that URL is not in `generateStaticParams`, so
`dynamicParams: true` renders it on demand and caches the result as its own ISR
entry (the debugger report measured `s-maxage=31536000` for this route class),
and Web Analytics records it as its own path row. The entire stated purpose of
this branch is one analytics row per region; a homoglyph or mixed-case link
silently splits it, and the URL space that does this is unbounded, not the
"one stray row" the comment budgets for.

No security impact — the value handed to `GameClient` is always the canonical
uppercase code, `isRegion` gates it, and nothing downstream trusts the slug.
This is a caching/attribution finding.

One-line fix that keeps the stated intent (`/game/TPHCM` must still play):

```js
export function regionFromSlug(slug) {
  const raw = String(slug);
  const code = raw.toUpperCase();
  // Reject anything that is not an ASCII re-casing of the slug: a dotless-i
  // spelling uppercases to a real code but is a different URL, and would be
  // cached and counted as one.
  return isRegion(code) && regionSlug(code) === raw.toLowerCase() ? code : null;
}
```

`'TPHCM'.toLowerCase() === regionSlug('TPHCM')` → still 200.
The dotless-i spelling lowercases to itself, not to `hn-badinh` → 404. Covered
by extending the existing casing test in `tests/regions.test.js:47-56` with one
line.

### M2 — 85 new indexable pages, one shared `<title>` (CONFIRMED)

`src/app/game/[region]/page.js:13-15`, `src/app/layout.js:19-22`

Build output confirms 85 SSG pages under `/game/[region]`. None exports
`metadata` or `generateMetadata`, so every one inherits the root
`title: "VNGeoGuessr"` / `description: "GeoGuessr for VietNam"`. There is no
`robots.txt` and no `sitemap`.

Failure scenario: before this branch there was exactly one `/game` URL and the
region lived in a query string crawlers ignore. Now a crawler reaches 85 thin
JS-shell pages with byte-identical titles and descriptions — a duplicate-title
cluster. The same gap is visible to the user: browser tab, history entry and
bookmark for `/game/hn-badinh` all read "VNGeoGuessr", so the one thing the new
URL shape newly expresses is the one thing the page never says.

Fix is a `generateMetadata` beside `generateStaticParams`. **Guard it** — this
is the trap: `getRegion()` (`src/lib/regions.js:23-31`) *throws* on an unknown
code, so a naive `generateMetadata` would turn the honest 404 at
`/game/notaregion` into a 500 before `notFound()` is ever reached. Resolve with
`regionFromSlug` first and return the bare root metadata when it is `null`.

Non-blocking, and arguably a follow-up rather than this branch's job — but the
branch is what created the surface.

## Low

- **L1** — `src/app/game/[region]/not-found.js:22-24` applies the theme once on
  mount and never subscribes. `watchSystemTheme` exists in `src/lib/theme.js:81`
  and `ThemeToggle` uses it. A `system`-theme visitor who flips OS appearance
  while sitting on this page keeps the old palette until they navigate. Rare
  page, rare gesture; noted for completeness only.
- **L2** — `tests/e2e/home.spec.js:38-58` and `tests/e2e/username.spec.js`
  repair drift caused by `6251ea5` (DebugFooter split into link + button) and
  the landing-prompt change, both already on `main`. The repairs are correct and
  test real behaviour — verified `DebugFooter.js:72,86` against the new
  assertions — but they are unrelated to this feature and widen the diff a
  `git bisect` on region routing would have to step over.
- **L3** — `tests/e2e/routing.spec.js:115,120` imports `../../src/lib/regions.js`
  twice in one test. Cosmetic.
- **L4** — `NotFoundPanel` was created against the ui-ux review's explicit
  recommendation not to abstract two eight-line panels. The component is
  justified in its own header comment and has a real domain anchor, so this is a
  defensible reversal, not scope creep. Recording the disagreement, not
  reopening it.
- **L5** — `plans/260906-1122-game-region-path-segment/plan.md:174,179` still say
  `/game/VN` and `/game/{code}`; the shipped convention is lowercase. Plan text
  only, and plan mutation is not mine to make. For the lead.

## Explicit checks requested

| Check | Result |
|---|---|
| Region slug validation | `[region]/page.js:31-33` resolves through `regionFromSlug` and `notFound()`s before rendering. `GameClient.js:97` keeps `isRegion` as a belt-and-braces guard, correctly described as such. **Pass**, with M1. |
| Case handling | `regionSlug` = `toLowerCase`, `regionFromSlug` = `toUpperCase`. Round trip asserted for all 85 codes (`tests/regions.test.js:38-44`) and slug charset asserted `^[a-z0-9-]+$` (`:28-36`). Both green. Uppercase URLs serve 200 without redirect, by design. **Pass**, with M1. |
| 404 on unknown region | `notFound()` thrown in the render path, not returned, not wrapped in `try/catch` — matches `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`. `[region]/not-found.js` is the closest boundary. E2E asserts status 404 and the visible way out. **Pass.** |
| Legacy `?region=` redirect | `game/page.js:36-51`. `firstValue` handles `string / string[] / undefined / ''` — the full documented search-param shape. `region` beats `location`, matching `main`'s `GameClient.js:171`. Destination is `encodeURIComponent`'d, so CRLF and `../` both end at an honest 404 (E2E `routing.spec.js:89-99`). Prototype-named keys (`?constructor=`, `?toString=`) fall through `firstValue`'s `typeof` check harmlessly — checked. **Pass.** |
| Server/client boundary | `[region]/page.js` imports exactly `next/navigation`, `GameClient`, `lib/regions`. No path to `pano-index`, `pano-db`, `pano-history`, `data/panos`, `data/boundaries`. The `use client` import-walk in `tests/regions.test.js:263-325` now covers the two new client files (`[region]/not-found.js` and, transitively, `NotFoundPanel`). **Pass.** |
| Resolved district / coordinates | The page passes exactly one prop, `region={code}` — a code the URL already contains. Prerendered HTML is identical for every visitor and contains no panorama data. `GameClient.js:16-19` still sources the revealed path from `/api/guess`, not client-side. **Pass.** |
| Windows vs Vercel case-sensitivity | The local `next start` ISR case-folding quirk is a known accepted local-verification hazard; not reported. Nothing in the current tree redirects from `[region]`, so the corruption path the debugger reproduced has no trigger left. |
| Concurrency | `key={code}` on `GameClient` (`[region]/page.js:41`) forces a remount on region change, closing the prop-vs-closure desync class outright. Epoch/watchdog/prefetch machinery is byte-identical to `main` apart from the identifier swap. **Pass.** |
| Error boundaries | `redirect()` and `notFound()` both signal by throwing and neither is caught. `applyTheme` in an effect cannot throw on a client (`window` guaranteed). **Pass.** |
| Backwards compatibility | Every legacy URL shape still resolves; no API route, schema or exported contract touched. `regionSlug`/`regionFromSlug` are additive. **Pass.** |
| Auth / authz / N+1 | Not applicable — anonymous public routes, no database access on either page. |
| `Button asChild` in a Server Component | `NotFoundPanel` is a Server Component importing `@/components/ui/button`. Same pattern already shipped in `src/app/debug/layout.js:20-31`, and `build:check` prerenders `/_not-found` clean. **Pass.** |

## Accepted trade-offs, deliberately not flagged

- Windows `next start` case-folds ISR cache keys; local-only, already in the
  debugger's agent memory.
- Debug routes stay in production.
- `/game` changes from static to `f` dynamic — one function invocation per
  legacy hit, `no-store`. Inherent to reading a query string server-side. (A bot
  can spend invocations with random `?region=` values, but so can it against any
  `/api/*` route already shipped.)
- Region-less `/game` now means the country round, not TPHCM.
- No canonical-casing redirect from `/game/[region]`; a redirect on an ISR route
  gets cached as that route's response.
- A real region with no imagery renders the API's coverage message instead of
  404ing.
- Legacy redirect is 307, not `permanentRedirect`'s 308 — conservative, keeps
  the region-less default changeable without stranding browser caches.
- The region 404 flashes light before hydration; documented in the file itself.
- Legacy absolute-ladder scores stay mixed on the boards.

## Plan status

`plan.md` is `status: completed` and all 12 acceptance boxes are checked. I
verified each against the tree and the build; all hold, with the two text
staleness nits in L5. No follow-up phase is required for the plan itself —
M1 and M2 are new findings, not unfinished plan work.

## Unresolved questions

1. Is M1 worth the one-line guard, or is the homoglyph URL space acceptable
   under the same "one stray row" reasoning already accepted for casing? The
   difference from the accepted case is that this set is unbounded and each
   member is a year-long ISR entry.
2. Does M2 belong to this branch or to the analytics plan
   (`plans/260906-1057-game-analytics-events/`)? Per-region titles and
   per-region analytics rows are the same product intent.
