---
title: "Recent location history filter"
description: "Remember the last 50 panoramas a player was shown and exclude them when drawing the next round"
status: completed
priority: P2
effort: "1d"
tags: [gameplay, redis, anti-repeat]
created: 2026-09-03
---

# Recent location history filter

## Overview

A player who grinds one region currently sees the same panorama again with no
memory between rounds. This plan keeps the last 50 panorama ids each player was
shown and passes them as an exclusion set when the next round is drawn.

The exclusion hook already exists: `pickRandomPano(code, excludeIds)` takes a
`Set` and `fetchRegionPanorama` already builds one to avoid re-drawing a
candidate whose Mapillary lookup failed. The work is supplying a *persistent*
seed for that set, which needs an identity the server can key on — and today
there is none.

## Contract

**Outcome** — Consecutive rounds for the same player never repeat a panorama
shown in that player's last 50 rounds, in any region, without turning a
would-be repeat into a visible error.

**Constraints**
- JavaScript only, individual function parameters (no object destructuring).
- No breaking changes to API response bodies, Redis key names already in use,
  or localStorage keys.
- `src/lib/pano-index.js` / `pano-db.js` stay server-only; the client learns
  nothing new about panorama ids or coordinates.
- Only `src/`, `docs/` and `plans/` are modified.
- Scale: 424,617 indexed panoramas; the smallest *playable* region holds 171
  (`DN-THANHKHE`), so a 50-id exclusion is at most ~29% of any pool.

**Non-goals** — accounts or login, cross-device history, per-region history
tuning, a "seen locations" UI, changing scoring or leaderboards.

**Acceptance criteria**
- [x] A first-time visitor gets an anonymous `vng_pid` cookie from
      `/api/new-game`; a returning visitor's cookie is reused, not reissued.
- [x] The last 50 panorama ids per player are stored in Redis with a rolling
      3-day TTL and are capped at exactly 50.
- [x] `/api/new-game` excludes those ids from the draw and records the newly
      drawn id, including for rounds that are later skipped.
- [x] A pool that the history would exhaust falls back to an unfiltered draw
      instead of reporting "no coverage".
- [x] A Redis history failure never fails a round.
- [x] `npm test`, `npm run lint`, `npm run build` green; `npm run test:integration`
      green against real Redis.

## Accepted design decisions

| Decision | Choice | Why |
|---|---|---|
| Identity | Anonymous `vng_pid` httpOnly cookie set by `/api/new-game` | No identity exists server-side today. `username` is client-supplied localStorage, only reaches `/api/guess`, and is renameable — renaming would silently reset history, and one player could poison another's by claiming their name. |
| Scope | One global list per player, last 50 across all regions | Matches the request literally and stays one key. Per-region keys would multiply across 100+ nodes and permanently mask ~29% of the smallest districts. |
| Record point | At round creation, in `/api/new-game` | Covers skipped and abandoned rounds, which are exactly the ones a player does not want to see again. One write, no changes to `/api/guess` or `/api/skip`. |
| Storage shape | JSON array in a string key via the existing `getJson`/`putJson` | Reuses the whole adapter. A Redis LIST (`LPUSH`+`LTRIM`) is the textbook shape but would need four new primitives in `upstash.js` plus a new value type in `tests/fake-upstash-redis.js`. The cost is a non-atomic read-modify-write; the worst case is one dropped entry when a player opens two rounds at once, which raises the repeat chance immeasurably. |
| TTL | 3 days, rolling on each write | User decision (2026-09-03). An idle player's history expires; an active one's never does. |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Anonymous per-browser identity + capped recent-pano store | P1 |
| 2 | Round generation excludes recent ids, degrades to a repeat rather than an error | P1 |
| 3 | Docs reflect the new cookie, key and flow; full suite verified | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Player id and history store](./phase-01-player-id-and-history-store.md) | Done |
| 2 | [Phase 2: Wire history into round generation](./phase-02-wire-history-into-round-generation.md) | Done |
| 3 | [Phase 3: Docs and verification](./phase-03-docs-and-verification.md) | Done |

Phase 2 depends on Phase 1. Phase 3 depends on both.

## Success Criteria

- [x] All acceptance criteria above met.
- [x] New unit tests cover cookie parsing, the 50-cap, TTL, exclusion, and the
      exhaustion fallback.
- [x] `docs/game-flow.md`, `docs/features.md`, `docs/project-structure.md`
      updated; `upstash.js` key-namespace comment lists the new key.

## Review

`plans/reports/code-reviewer-260903-1400-recent-location-history.md` —
DONE_WITH_CONCERNS, 3 medium + 3 low, all resolved except one consciously
declined (a thin but non-duplicate response-body test). Notable fixes: the
`pano-history.js` header understated the live-round exposure and the module was
missing from the client-import `FORBIDDEN` list; the downgrade warning blamed
the history for regions that simply held no rows.

## Verification (2026-09-03)

- `npm test` — 265 passed / 19 files (was 248 before this work; 263 before
  the review fixes added two).
- `npm run test:integration` — 260 passed, 3 skipped, against real Redis via SRH.
  The three skips are `fakeOnly` fake-timer expiry tests, including this
  feature's TTL-refresh assertion.
- `npm run lint` — 0 errors, 19 warnings, all pre-existing React-Compiler
  warnings in client components this change did not touch.
- `npm run build` — clean.
- `npm run test:e2e` — `game.spec.js` + `home.spec.js` 8/8 pass (these are the
  specs that drive `/api/new-game`, so they cover the new `Set-Cookie`).
  `username.spec.js` fails 3 of 4 — verified pre-existing by stashing this work
  and re-running on clean `main`, which fails the same three. A dialog overlay
  intercepts a Play click; unrelated to this change, no client component touched.

## Open questions

- The `vng_pid` cookie is strictly functional (anti-repeat only, no tracking,
  no PII, not shared). Under ePrivacy that class is normally consent-exempt,
  but whether this project wants a cookie notice anyway is the user's call.
- `scanKeys` in `src/lib/upstash.js` has no caller in `src/` or `scripts/`. Is
  it a live ops/backup surface used from outside the repo, or dead code?
- `username.spec.js` fails 3 of 4 Playwright specs on clean `main`, unrelated to
  this work. Worth its own fix pass.

<!-- slug: recent-location-history-filter -->
