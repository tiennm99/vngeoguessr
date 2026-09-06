---
title: "Game region as a path segment"
description: "Move /game?region=X to /game/X so the region is a real route, unlocking per-region traffic in Vercel's free Pages dimension"
status: completed
priority: P1
effort: "1d"
tags: [routing, analytics, next]
created: 2026-09-06
blocks: [260906-1057-game-analytics-events]
---

# Game region as a path segment

## Overview

`/game?region=TPHCM` becomes `/game/tphcm`, backed by an
`app/game/[region]/page.js` dynamic segment.

**Why:** the project is on the Vercel Hobby plan, where custom events are
unavailable and the Pages dimension strips query parameters on every plan
(decision:
[`plans/reports/decision-260906-1116-analytics-constraint-free-plan.md`](../reports/decision-260906-1116-analytics-constraint-free-plan.md)).
Region popularity is therefore unobtainable today at any price through a query
string. As a path segment it appears free, as one Pages row per region.

**Why it stands on its own merits:** a region-scoped screen deserves its own
URL. It becomes shareable and bookmarkable, an unknown region becomes a real
404 instead of silently rendering as "Vietnam", and the page stops needing
`useSearchParams` and its `Suspense` boundary at all. The analytics benefit
falls out of correct routing rather than being bolted on.

**Contract**

- Outcome: `/game/{REGION}` serves the game; every in-app link points at it;
  every existing `?region=` / `?location=` link still works via redirect.
- Constraints: JavaScript only, individual function parameters, no new
  dependencies. No change to any API route — `/api/new-game?region=` and the
  rest stay exactly as they are. No gameplay behavior change.
- Non-goals: analytics instrumentation of any kind (see the shelved
  `260906-1057-game-analytics-events`); renaming region codes; changing the
  region tree; a locale or other new segment.
- Acceptance: see Success Criteria.

## Scope: what actually uses a query param

Verified by grep across `src/` and `tests/`. The migration surface is **one
page and one param**:

| Producer / consumer | File | Change |
|---|---|---|
| Link href | `RegionPicker.js:52` | `/game?region=${code}` → `/game/${code}` |
| Param read | `GameClient.js:171` | `searchParams.get(...)` → a `region` prop |
| Page shell | `app/game/page.js` | Becomes the redirect target; the real page moves to `[region]/` |
| E2E navigation | `tests/e2e/game.spec.js:14`, `home.spec.js:26`, `username.spec.js:28,39` | New URLs |

**Unaffected, deliberately:** every API route. `/api/new-game`,
`/api/leaderboard` and the debug routes keep their `?region=` query, and
`src/lib/region-request.js` (which also accepts a `city` alias) is untouched.
Those are `fetch()` calls, never navigations — analytics never saw them and
nothing about them needs to change.

## Key Design Decisions

**D1 — The page becomes a Server Component; `GameClient` takes a prop.**
`app/game/page.js` is currently `"use client"` purely so it can call
`useSearchParams`, which forces the `Suspense` boundary around `GameClient`.
With a path segment, `app/game/[region]/page.js` can be a Server Component that
resolves `params`, validates the code, and renders `<GameClient region={code} />`.
The `Suspense` wrapper and `GameLoadingFallback` go away with it.

**D2 — `generateStaticParams` over every region, `notFound()` for the rest.**
Export `generateStaticParams()` returning every code from `allRegions()`, so all
~70 region pages prerender at build time. In the page body, guard with
`isRegion(code)` and call `notFound()` otherwise.

Deliberately **not** `playableRegions()` + `dynamicParams = false`: that would
404 an unplayable-but-real region like a Da Nang district with no imagery, and
the app has a considered error message for exactly that case ("... has no
street view coverage yet", `region-request.js:57`). A 404 would be a worse
answer than the one already written. Keep the playability check where it is —
in the API — and let the page render its existing error panel.

**D3 — Normalize case in the page, not the router.** *(REJECTED after review — superseded by the lowercase-slug decision below.)* The app uppercases region
codes today (`GameClient.js:96`), so `?region=hn` works. `/game/hn` must keep
working: the page uppercases before `isRegion`, and when the incoming segment
differs from its canonical form, `redirect()`s to the canonical URL so
analytics sees one row per region rather than a row per casing.

**D4 — `next.config.mjs` redirects, not middleware.** Two static rules with a
named capture group cover both legacy params. This project has no middleware
today and a redirect table is the smaller, more legible surface:

```js
{
  source: '/game',
  has: [{ type: 'query', key: 'region', value: '(?<region>.+)' }],
  destination: '/game/:region',
  permanent: false,
}
```

The named capture group is what makes `:region` available in the destination
(verified in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md:196-208`).
A second identical rule handles `key: 'location'`.

**D5 — `permanent: false` (307), not 308.** A permanent redirect is cached hard
by browsers and is painful to walk back if a rule is wrong. Ship 307; promote to
308 once the new URLs have been live and correct for a while. The cost of 307 is
a marginally weaker SEO signal, which does not matter here.

**D6 — Bare `/game` keeps working.** `app/game/page.js` stays, reduced to a
redirect to `/game/VN`. Today a region-less `/game` silently defaults to
`TPHCM` (`GameClient.js:171`); `VN` is the better default — it is the country
node, matches the home page's primary "Play anywhere in Vietnam" action, and
`resolveRegion` already treats an absent region as the country
(`region-request.js:35-36`). Flag this as a deliberate behavior change.

## Implementation note (2026-09-06)

**D4 was rejected during implementation.** The `next.config.mjs` `redirects()`
rule was written and tested exactly as planned, and it worked — but Next
forwards the source query string to the destination, so `/game?region=TPHCM`
landed on `/game/TPHCM?region=TPHCM` and the dead param stuck to the URL
permanently. Caught by `tests/e2e/routing.spec.js`.

Legacy handling moved into `app/game/page.js` instead — the fallback this
plan's own Phase 2 risk section named. `next.config.mjs` is unchanged from main.

Two things got better as a result: the destination is built in one place with
no query carried over, and the uppercase happens in the same hop, so
`?region=hn` reaches `/game/HN` directly instead of bouncing through
`/game/hn`. The cost is that `/game` is now a dynamic route (`ƒ`) rather than
static, which is correct — it has to read the query to do its job.

D5's `permanent: false` reasoning is moot: `redirect()` from a Server Component
issues a 307 by default, which is what was wanted.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `/game/{REGION}` serves the game, prerendered per region | P1 |
| 2 | Every existing `?region=` / `?location=` / bare `/game` link still works | P1 |
| 3 | Vercel's Pages panel shows one row per region | P1 |
| 4 | An unknown region 404s instead of rendering as "Vietnam" | P2 |
| 5 | `useSearchParams` and its Suspense boundary removed from the game route | P2 |
| 6 | Docs reflect the new URL shape | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Dynamic route](./phase-01-dynamic-route.md) | Completed |
| 2 | [Phase 2: Callers and redirects](./phase-02-callers-and-redirects.md) | Completed |
| 3 | [Phase 3: Tests and docs](./phase-03-tests-and-docs.md) | Completed |

Strictly sequential — Phase 2 rewires callers to the route Phase 1 creates, and
Phase 3 verifies both.

## Risks

| Risk | Mitigation |
|---|---|
| Shared/bookmarked `?region=` links break | The redirect rules are Phase 2, in the same change as the link rewrite. Phase 3 asserts both old forms redirect before the plan is done |
| Build time grows with ~70 prerendered pages | Each is a thin client-component shell, not a data fetch. If `next build` slows materially, drop `generateStaticParams` — the route still works, rendered on demand |
| ~~The uppercase redirect (D3) collides with the query redirect (D4) into a loop~~ | Moot: both redirects were rejected during implementation. There is no casing redirect and no config rule |
| Region codes contain characters that need URL encoding | Codes are `[A-Z0-9-]` (verified in `src/data/regions/index.js`) — URL-safe as-is. If a future code adds anything else, this assumption breaks silently; Phase 1 adds a test asserting the character class |
| Analytics still shows nothing useful after shipping | The Pages dimension is documented as capturing the path; if regions still do not appear after a day of traffic, the fallback is PostHog's free tier, not a Vercel upgrade (see the decision report) |

## Success Criteria

- [x] `/game/tphcm`, `/game/vn` and `/game/hn-badinh` all play normally
- [x] `/game?region=TPHCM` and `/game?location=TPHCM` both redirect to `/game/tphcm`
- [x] `/game` redirects to `/game/VN`
- [x] `/game/TPHCM` (any casing) serves 200 directly — no canonical-casing redirect
- [x] `/game/NOTAREGION` returns 404
- [x] `/game/DN-HOANGSA` (real but unplayable) renders the existing coverage
      error panel, **not** a 404
- [x] `RegionPicker` emits `/game/{code}` hrefs; no `?region=` remains in `src/`
      outside API-route call sites
- [x] No `useSearchParams` in the game route
- [x] `npm test` green, `npm run lint` 0 errors, `npm run build` clean,
      `npm run test:e2e` green
- [x] Docs updated to the new URL shape

## D3 rejected too: lowercase slugs, no casing redirect (2026-09-06)

Found by the runtime review (`plans/reports/debugger-260906-1523-*`) and
reproduced independently: on a case-insensitive filesystem, Next's ISR disk
cache treats `/game/dna` and `/game/DNA` as one entry. A first lowercase hit
served the prebuilt page without running the redirect; background revalidation
then wrote the `redirect()` response — which had lost its `Location` header —
into the shared entry, so the *canonical* URL answered `307` to nowhere,
cached, for the life of the process. Reproduced on `LA`, `DNA` and `BD`
against `next start` on Windows.

Linux is case-sensitive, so Vercel was probably unaffected — but that was
inference, not a test.

Resolved by the user's call: **URL slugs are lowercase, and the casing
redirect is gone.** Any casing now serves 200 directly. That removes the
mechanism rather than dodging it — a cached redirect on a prerendered route is
what breaks, and there is no longer a redirect on that route on any platform.
Verified: all three regions serve 200 repeatedly where they previously
returned a cached 307 with no `Location`.

`regionSlug` / `regionFromSlug` in `src/lib/regions.js` own the conversion,
because three call sites build these URLs and a mismatch between any two would
split one region across two analytics rows.

Cost accepted: a hand-typed uppercase URL is its own Pages row. Nothing in the
app generates one.

## Post-review additions (2026-09-06)

Code review: [`plans/reports/code-reviewer-260906-1237-game-region-path-segment.md`](../reports/code-reviewer-260906-1237-game-region-path-segment.md)
(DONE_WITH_CONCERNS). Applied beyond the plan as written:

- **`encodeURIComponent` on the legacy redirect target** (review H1). The
  legacy query value reached a `Location` header unvalidated: a raw CRLF made
  Node throw a 500 instead of the intended 404, and a `../` would have been
  normalised by the browser onto another path. Same-origin either way, but the
  safety argument rested on browser normalisation. Covered by a routing test.
- **`key={code}` on `<GameClient>`** (review M2). Latent, not a live bug --
  nothing navigates region-to-region without unmounting today -- but a path
  segment makes prop-change-without-remount the normal App Router pattern, and
  `GameClient` initialises once behind an `initialized` guard.
- **`src/app/game/[region]/not-found.js`** (review M3, user-approved). Goal 4
  created a new user-reachable 404; Next's stock page is a dead end with no way
  back to the picker.
- **Four stale e2e specs repaired** (user-approved, beyond plan scope). Three
  in `username.spec.js` asserted "landing shows no prompt", contradicting the
  deliberate landing-prompt change in `src/app/page.js:47-53`; one in
  `home.spec.js` expected the sha and the copy control to be one button,
  contradicting commit `6251ea5`, which split them. All four were red on `main`
  before this plan started. The suite is now 23/23.

Not done, recorded as known gaps:

- No test proves the *screen* renders the coverage message for a real
  uncovered region. `region-request.test.js` proves the API produces it and
  `routing.spec.js` proves the page serves; nothing joins the two, because the
  e2e suite stubs `/api/new-game`. Pre-existing gap this change surfaced.
- The client-safety import walk in `tests/regions.test.js` only visits files
  carrying `'use client'`, so a Server Component importing pano data and
  passing it down as a prop would not be caught. `[region]/page.js` is the
  first Server Component in the game path, so this blind spot is now one
  refactor from mattering.

## Open Questions

1. Is changing bare `/game`'s default from `TPHCM` to `VN` (D6) acceptable?
   Planned as `VN`; say so if you want the old default kept.
2. After this ships and traffic accrues, do you want the PostHog follow-up for
   score/skip/failure metrics, or is region popularity plus traffic enough for
   the ads decision? Not blocking — revisit with data.

<!-- slug: game-region-path-segment -->
