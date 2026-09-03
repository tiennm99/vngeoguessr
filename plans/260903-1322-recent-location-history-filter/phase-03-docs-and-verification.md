---
title: "Phase 3: Docs and verification"
status: completed
phase: 3
priority: P2
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Docs and verification

## Overview

Record the user-visible and maintainer-facing consequences of the change — a
new cookie, a new Redis key, and a round-generation step that did not exist —
then verify the whole suite, including the real-Redis integration run that a
new key shape and TTL warrant.

## Requirements

- [x] Docs describe the anti-repeat behaviour, the cookie, and its purpose.
- [x] The Redis key namespace and the two new libraries are documented where
      the existing ones already are.
- [x] Unit, lint, build, integration and e2e suites all pass.

## Architecture

Docs impact is real here by the project's own rule: the change adds a cookie
(user-visible), a persisted key (architecture), and a step in the documented
game flow. It does not change any public API contract.

| File | Change |
|---|---|
| `docs/game-flow.md` | In "3. Session Creation" / "4. Location Display Process": the server resolves an anonymous player id, excludes that player's last 50 panoramas from the draw, and records the drawn one. Note that a skipped round still counts as seen. |
| `docs/features.md` | Under "Location Coverage" or a short new subsection: locations do not repeat within a player's last 50 rounds. State plainly that the `vng_pid` cookie is anonymous, httpOnly, functional-only, and carries no personal data. Confirm the "Anti-Cheat Security" section is unaffected — no answer data moved client-side. |
| `docs/project-structure.md` | Add `player-id.js` and `pano-history.js` to the `src/lib/` list (around lines 99-120), each with a one-line purpose, matching the existing entry style. |
| `src/lib/upstash.js` | Already covered in Phase 1: the logical key namespace comment gains `history:{playerId}`. Re-read it here to confirm the TTL stated matches `HISTORY_TTL`. |

`README.md` needs no change: the cookie requires no configuration and no new
environment variable.

## Related Code Files

- Modify: `docs/game-flow.md`
- Modify: `docs/features.md`
- Modify: `docs/project-structure.md`
- Verify only: `src/lib/upstash.js`, `plans/260903-1322-recent-location-history-filter/*`

## Implementation Steps

1. Read each doc file before editing it; edit the smallest owning section
   rather than appending a new one where an existing section covers the topic.
2. `npm test` — full unit suite.
3. `npm run lint` — zero errors.
4. `npm run build` — clean production build.
5. `npm run redis:up` then `npm run test:integration` — the same suite against
   real Redis. This is the run that actually proves the TTL and the
   read-modify-write behave against Upstash semantics rather than the in-memory
   fake. Then `npm run redis:down`.
6. `npm run test:e2e` — the Playwright specs are fully stubbed, so this is a
   regression check that a `Set-Cookie` on `/api/new-game` breaks nothing in
   the stubbed round flow.
7. Report results to the user, who handles manual UI testing.

## Success Criteria

- [x] Every claim added to `docs/` is checked against the shipped code, not
      against this plan.
- [x] `npm test`, `npm run lint`, `npm run build` green.
- [x] `npm run test:integration` green against real Redis, with the history key
      observed to expire.
- [x] `npm run test:e2e` green.
- [x] No file outside `src/`, `docs/`, `plans/` modified.

## Risk Assessment

| Risk | Signal | Response |
|---|---|---|
| Integration suite fails only against real Redis | TTL or JSON round-trip differs from the fake | Fix the library, not the test; the fake is the thing that is wrong if they disagree |
| A stopped Docker Redis is left running after the integration run | `docker compose ps` shows the container | Always finish with `npm run redis:down` |
| Docs drift from the implementation during review | A later phase edit changes `HISTORY_LIMIT` or the cookie name | Docs are written last, after Phases 1-2 are final; re-check the two constants before marking this phase complete |
