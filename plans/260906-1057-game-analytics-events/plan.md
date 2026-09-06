---
title: "Game analytics events"
description: "Instrument the play flow with Vercel Analytics custom events, behind a privacy filter that keeps coordinates, pano ids and usernames out of analytics"
status: cancelled
priority: P2
effort: "1d"
tags: [analytics, instrumentation, privacy]
created: 2026-09-06
blockedBy: [260906-1122-game-region-path-segment]
---

> **SHELVED 2026-09-06 — cannot ship on this deployment.**
> The project is on the Vercel Hobby plan, where custom events are not
> included, so all 12 `track()` call sites below would be no-ops. See
> [the decision record](../reports/decision-260906-1116-analytics-constraint-free-plan.md)
> and [the research](../reports/research-260906-1110-vercel-analytics-free-limits.md).
> Superseded for now by
> [260906-1122-game-region-path-segment](../260906-1122-game-region-path-segment/plan.md),
> which gets region popularity from the free Pages dimension instead.
>
> **Still valid if we later adopt PostHog or upgrade:** the event vocabulary,
> the privacy allowlist (D4) and the distance-banding rationale (D3).
> **Known wrong, do not carry forward:** the `beforeSend` query-stripping —
> Vercel already strips query params from the Pages dimension, so it buys
> nothing. The `/debug/*` exclusion is still worth keeping.

# Game analytics events

## Overview

Today `<Analytics />` and `<SpeedInsights />` sit bare in
`src/app/layout.js:71-72` with no props, and no `track()` call exists anywhere
in `src/`. That yields pageviews, visitors, geo, device and Web Vitals — and
nothing about the game. We cannot answer which regions get played, how accurate
guesses are, how many rounds a visit lasts, how often a panorama fails to load,
or whether the donate and leaderboard entry points get used.

This plan adds custom events across the play flow, a shared client-side helper
that shapes and sanitises their properties, and a `beforeSend` filter that drops
`/debug/*` pageviews and strips query strings.

**Why now:** the accepted monetization direction is donation now, ads later
(see `plans/260901-0857-geoapify-tile-migration/`). Ad viability rests on
rounds-per-visit and region popularity — neither is measurable today, and
analytics only counts forward from the day it ships.

**Contract**

- Outcome: every meaningful player action in the play flow emits a Vercel
  Analytics custom event with low-cardinality, privacy-safe properties; the
  event vocabulary lives in one tested module.
- Constraints: JavaScript only, individual function parameters (not object
  destructuring), no new dependencies, no behavior change to the game itself.
  Analytics failures must never break a round.
- Non-goals: server-side `track()` from route handlers; a second analytics
  vendor; funnel dashboards; A/B testing; consent UI.
- Acceptance: see Success Criteria.

## Key Design Decisions

**D1 — One `src/lib/analytics.js` module, not scattered `track()` calls.**
Event names and property shaping live in one place with unit tests, the same way
`src/lib/game.js` owns the scoring ladder rather than letting call sites re-type
thresholds. Call sites import named functions; they never type an event-name
string. This also gives the privacy rules a single choke point.

**D2 — `beforeSend` needs a client wrapper component.**
`src/app/layout.js` is a Server Component, and `Analytics` from
`@vercel/analytics/next` is marked `"use client"` (verified at
`node_modules/@vercel/analytics/dist/next/index.mjs:1`). React cannot pass a
function prop across that boundary, so writing `beforeSend={fn}` directly in
`layout.js` throws at render. A small `"use client"` wrapper owns the filter and
renders `<Analytics beforeSend={...} />` itself.

**D3 — Band the values, do not send raw ones.**
`distance` is sent as a band label (`0-50m`, `50-100m`, ...) derived from
`SCORE_BANDS`, never as raw metres. Vercel custom-event properties are
dimensions, so raw metres would explode cardinality and make the distance
distribution unreadable — and a raw distance paired with a small district
narrows down where the panorama was.

**D4 — Never send coordinates, pano ids, panorama URLs, usernames or session
ids.** Enforced in the module (payloads are built from an allowlist, never
spread from a result object) and asserted by tests. This mirrors the client-safe
boundary `src/lib/regions.js` already documents and `tests/regions.test.js`
already enforces.

**D5 — Fire-and-forget, always guarded.**
Every emit goes through one internal helper wrapped in `try/catch`. A thrown
analytics error must never surface as a failed round; the game takes no
dependency on analytics in either direction.

## Event Vocabulary

| Event | Properties | Phase |
|---|---|---|
| `round_started` | `region`, `level` (`country`/`province`/`district`), `source` (`initial`/`next`/`skip`/`retry`) | 2 |
| `guess_submitted` | `region`, `level`, `points` (0-5), `band` (`0-50m`...`1km+`) | 2 |
| `round_skipped` | `region`, `level` | 2 |
| `round_result_exit` | `region`, `action` (`next`/`menu`) | 2 |
| `region_selected` | `region`, `level`, `source` (`country`/`continue`/`province`/`district`) | 3 |
| `leaderboard_opened` | `from` (`home`/`result`) | 3 |
| `leaderboard_filtered` | `level`, `type` (`score`/`distance`) | 3 |
| `donate_opened` | `from` (`home`/`game`) | 3 |
| `username_set` | `mode` (`typed`/`generated`), `from` (`home`/`game`) | 3 |
| `pano_load_failed` | `region`, `reason` (`fetch`/`viewer`/`timeout`) | 4 |
| `guess_submit_failed` | `region` | 4 |
| `session_progress` | `rounds` (1/3/5/10/25), `points`, `region` | 4 |

`level` is read from the region node's own `level` field, which already holds
exactly `'country' | 'province' | 'district'` (see `src/data/regions/index.js`),
so it cannot drift from the region tree. `/api/new-game` already echoes
`region: { code, name, path, level }` via `publicRegion()`
(`src/lib/region-request.js:73`), so the gameplay events read the level the
server resolved rather than recomputing it.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Single tested module owning event names, property shaping and the privacy allowlist | P1 |
| 2 | `beforeSend` filter dropping `/debug/*` and stripping query strings | P1 |
| 3 | Gameplay funnel measurable: region popularity, accuracy distribution, skip rate | P1 |
| 4 | Engagement entry points measurable: region picker, leaderboard, donate, username | P2 |
| 5 | Failure rates and rounds-per-visit measurable | P2 |
| 6 | Docs record the event vocabulary and the privacy boundary | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Analytics foundation](./phase-01-analytics-foundation.md) | Pending |
| 2 | [Phase 2: Gameplay funnel](./phase-02-gameplay-funnel.md) | Pending |
| 3 | [Phase 3: Engagement events](./phase-03-engagement-events.md) | Pending |
| 4 | [Phase 4: Reliability and session depth](./phase-04-reliability-and-depth.md) | Pending |

Phase 1 blocks 2, 3 and 4. Phases 2, 3 and 4 all touch
`src/app/components/GameClient.js`, so run them sequentially — do not split
them across parallel agents. Phase 3 additionally touches `page.js`,
`RegionPicker.js` and `LeaderboardModal.js`, which no other phase edits; if
parallelism is ever wanted, the only safe split is Phase 3's non-`GameClient`
files.

## Risks

| Risk | Mitigation |
|---|---|
| The project's Vercel plan may cap custom events below what 12 event types generate | Confirm the plan's event allowance before Phase 2 lands (Open Question 1). If capped, drop `round_result_exit` and `leaderboard_filtered` first — they are the least decision-relevant |
| Ad blockers drop the analytics script, biasing counts downward | Accepted; the numbers are directional, not absolute. Do not add a server-side fallback to "fix" it — that is a stated non-goal and would move round data onto the server path |
| A `track()` call placed in a render body fires on every re-render | All emits sit in event handlers or in `useEffect` with an explicit dependency guard, never in render bodies. Phase 2 carries a specific step for the `round_started` dedupe, which is the one genuinely at risk |
| Event properties drift between call sites and the module | Call sites import functions, never event-name strings; `tests/analytics.test.js` asserts each emitted payload shape |
| `beforeSend` accidentally drops real pageviews | The filter matches `/debug` as a parsed path prefix only. A unit test covers `/debug`, `/debug/coverage`, `/debugger` (must NOT match), `/game`, `/` and a `/game?region=` URL |
| Instrumenting `GameClient.js` (561 lines, epoch-guarded round state) introduces a regression | Phase 2 adds only calls inside existing handlers; it changes no state transition, no epoch logic and no early return. Reviewed against the existing e2e specs before merge |

## Success Criteria

- [ ] `src/lib/analytics.js` exports one named function per event in the vocabulary table
- [ ] `tests/analytics.test.js` passes, asserting: band boundaries, `level` derivation, the property allowlist, and that no coordinate/pano/username value can reach a payload
- [ ] A `"use client"` analytics wrapper renders `<Analytics beforeSend={...} />`; `layout.js` no longer imports `Analytics` directly
- [ ] `beforeSend` drops `/debug/*` pageviews and strips query strings from every tracked URL
- [ ] All 12 events fire at their call sites, verified in the browser console with `debug` enabled in dev
- [ ] No coordinates, pano ids, panorama URLs, usernames or session ids appear in any payload
- [ ] `npm test` green, `npm run lint` 0 errors, `npm run build` clean, `npm run test:e2e` still 9/9
- [ ] The owning docs surface records the event vocabulary and the privacy boundary

## Open Questions

1. Which Vercel plan is this project on? Determines the custom-event allowance
   and whether the 12-event vocabulary needs trimming (see Risks).
2. Should `session_progress` use milestones (1/3/5/10/25), or would a
   `rounds_this_visit` property on `guess_submitted` be enough? The milestone
   event is easier to read in the Vercel UI; the property emits fewer events.
   Planned as milestones; say so if you prefer the property.

<!-- slug: game-analytics-events -->
