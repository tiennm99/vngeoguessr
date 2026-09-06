---
phase: 4
title: "Reliability and session depth"
status: pending
priority: P2
effort: "2h"
dependencies: [1, 2]
---

# Phase 4: Reliability and session depth

## Overview

Surface the failures that today only reach `console.error`, and measure how long
a visit lasts. Failure rates tell us whether Mapillary coverage gaps are hurting
real players; session depth is the number ad viability rests on.

Closes the plan: also updates the docs surface with the event vocabulary and
the privacy boundary.

## Requirements

**Functional**
- `pano_load_failed` fires for all three distinct failure modes, each labelled.
- `guess_submit_failed` fires when a guess is not recorded.
- `session_progress` fires at rounds 1, 3, 5, 10 and 25 of a visit.

**Non-functional**
- A milestone fires at most once per visit per threshold.
- No emit in a render body; the milestone effect must be dependency-guarded.
- Error emits carry no error message text — a message could contain a URL with
  a pano id. Only the fixed `reason` enum.

## Architecture

**Three genuinely different panorama failures**, already distinguished in
`GameClient.js` and worth keeping apart — they have different causes and
different fixes:

| `reason` | Existing seam | Cause |
|---|---|---|
| `fetch` | `loadRound`'s `catch`, where `setLoadError` runs | `/api/new-game` failed or found no image |
| `viewer` | `handlePanoramaError` | The panorama texture failed to load in the viewer |
| `timeout` | The 15s watchdog `useEffect` | Neither `ready` nor `panorama-error` ever fired |

The watchdog currently just calls `setRoundLoading(false)`; that timer firing is
the signal that a player sat looking at a spinner for 15 seconds, which today is
invisible.

**`guess_submit_failed`** attaches where `setResult({ failed: true })` runs in
`handleSubmitGuess` — both the null-result branch and the `catch`, which already
share one representation deliberately.

**`session_progress`** reads the existing `sessionRounds` / `sessionPoints`
state, which `GameClient` already maintains for the header badge. Add a
`useEffect` keyed on `sessionRounds` that emits when the new value is in
`[1, 3, 5, 10, 25]`. Because `sessionRounds` only ever increments by one, each
threshold is crossed exactly once per mount — no "already fired" ref needed.
State reset by a page reload is intentional and matches what the badge shows.

**Why not a raw `rounds` number on every `guess_submitted`.** See the plan's
Open Question 2. Milestones keep the property low-cardinality and readable as
a retention curve in the Vercel UI; a raw count spreads across dozens of values.

## Related Code Files

- Modify: `src/app/components/GameClient.js`
- Modify: the owning docs surface (see step 5)
- Read for reference: `src/lib/analytics.js` (Phase 1)

## Implementation Steps

1. **`pano_load_failed` — `fetch`.** In `loadRound`'s `catch`, after the
   existing epoch guard and `setLoadError`, emit with the round's region and
   `reason: 'fetch'`. Pass no part of `error.message`.

2. **`pano_load_failed` — `viewer`.** In `handlePanoramaError`, after the
   `appliedEpochRef` guard, emit with `reason: 'viewer'`.
   - `handlePanoramaError` is a `useCallback` with `[]` deps and has no region
     in scope. Add a `roundRegionRef` set in `applyRound` from
     `data.region.code`, and read it here — this keeps the dependency array
     empty, for the same reason Phase 2 reads the region off the response.

3. **`pano_load_failed` — `timeout`.** In the watchdog `useEffect`, emit inside
   the `setTimeout` callback alongside `setRoundLoading(false)`, with
   `reason: 'timeout'` and the region from `roundRegionRef`.

4. **`guess_submit_failed`.** Emit at both `setResult({ failed: true })` sites
   in `handleSubmitGuess`. Extract a tiny local helper if the duplication is
   awkward, but do not restructure the existing error handling — the two paths
   are deliberately one representation.

5. **`session_progress`.** Add a `useEffect` on `[sessionRounds]` that emits
   when `sessionRounds` is a milestone, carrying `sessionRounds`,
   `sessionPoints` and the region. Read `sessionPoints` from a ref or include
   it in the deps knowingly — including it would re-run the effect on a
   0-point round and re-emit the same milestone, so use a ref.

6. **Docs.** Add the event vocabulary table and the privacy boundary (D4 in
   `plan.md`) to the owning docs surface. Discover the target through the root
   `README`/`CLAUDE.md` and the existing `docs/` navigation rather than
   assuming a filename — `docs/features.md` and `docs/tech-stack.md` are both
   plausible owners, and `docs/tech-stack.md:78-81` already has an
   "Development & Analytics" section that names `@vercel/analytics`. Link to
   `src/lib/analytics.js` as the machine-readable source rather than
   duplicating the event list in prose if the two would drift.

7. Verify each failure mode in dev: block `/api/new-game` in devtools
   (`fetch`), point the viewer at a broken URL (`viewer`), throttle to a stall
   (`timeout`). Play 5 rounds to see two milestones.

8. Run `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`.

## Todo

- [ ] `roundRegionRef` added, set in `applyRound`
- [ ] `pano_load_failed` for `fetch`, `viewer` and `timeout`
- [ ] No error message text in any payload
- [ ] `guess_submit_failed` at both failure sites
- [ ] `session_progress` milestones, each firing at most once per visit
- [ ] Docs updated on the correct owning surface
- [ ] `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e` green

## Success Criteria

- [ ] All three `pano_load_failed` reasons reproduced in dev and observed
- [ ] Playing 5 rounds emits exactly three `session_progress` events (1, 3, 5)
- [ ] No milestone fires twice within one visit
- [ ] No payload anywhere contains an error message, URL or pano id
- [ ] Docs record the vocabulary and the privacy boundary
- [ ] `npm run build` clean, 9/9 e2e specs pass
- [ ] Full-plan check: all 12 events observed firing at least once in dev

## Risk Assessment

**The watchdog emit fires for a round the player already left.** The timer is
cleared on `roundLoading` going false, but a round abandoned by navigation could
still fire. Signal: `timeout` counts noticeably exceed observed stalls.
Response: guard the emit on the same epoch check the other handlers use, and
confirm the effect's cleanup actually clears the timer (it does today —
`return () => clearTimeout(timer)`).

**`session_progress` re-emits on a re-render.** The classic failure: putting
`sessionPoints` in the dependency array makes the effect re-run when points
change without rounds changing. Signal: duplicate milestone events at the same
`rounds` value. Response: `sessionPoints` via a ref, deps `[sessionRounds]`
only — specified in step 5, but verify in step 7 rather than trusting it.

**Assumption that may break:** that a 15s stall is rare enough to be worth an
event. If `timeout` turns out to fire on a large share of rounds, the event
stops being a signal and becomes noise that also burns the custom-event
allowance. Response: after a week of data, either raise the watchdog ceiling or
drop the `timeout` reason — and treat a high rate as a real product finding
about panorama load times, not an analytics problem.
