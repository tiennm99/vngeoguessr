---
phase: 6
title: "Docs and verification"
status: todo
priority: P2
effort: "0.5d"
dependencies: [5]
---

# Phase 6: Docs and verification

## Overview

Reconcile the documentation with what the code now does, write the coverage note,
sweep for leftover vocabulary, and run the full gate.

The docs in `/docs/` are the project's stated authority — `CLAUDE.md` points at
them first — and every one currently describes a five-city flat model.
`docs/features.md` is worse than stale: it documents a "Dart-throw Strategy" and
per-city delta tuning that `src/lib/pano-index.js` replaced entirely.

## Requirements

- The coverage note is written and classifies absent coverage into its three causes.
- Every `/docs/` claim about cities, leaderboards, or the pipeline matches the code.
- No stale `city`-as-a-model vocabulary outside the Redis key names, which stay
  `city` on purpose.
- The full gate passes: lint, unit tests, integration tests, build check.

## The coverage note

Canonical location: `docs/project-overview.md`. This is the deliverable the user
asked for, and its value is the *classification* — a note that only says
"coverage is partial" teaches maintainers to ignore real gaps.

> ## Coverage
>
> Five provinces — Ha Noi, Ho Chi Minh, Da Nang, Lam Dong, Long An — split into
> 61 districts and towns. Coverage is deliberately partial and will grow in
> future releases. **None are planned at present.**
>
> Absent coverage has three distinct causes. Only one is a defect:
>
> **Not yet added** — any province outside the five. Roadmap, not a bug. Adding
> one is an entry in `scripts/build-region-boundaries.mjs`, a boundary build, a
> panorama index build, and a district assignment run. No application code
> changes.
>
> **No street imagery** — a district inside a covered province where Mapillary
> holds no panoramas, typically rural. The tree lists it; `playableRegions()`
> excludes it from play. Expected, and it may resolve on its own: re-running the
> panorama index build picks up new Mapillary coverage.
>
> **Missing from the boundary** — a district whose OpenStreetMap lookup did not
> resolve, so it never entered the province union and its panoramas were clipped
> away. Cu Chi in Ho Chi Minh City is the known case (`"missingParts": 1` in
> `src/data/boundaries/tphcm.json`). Fixable: resolve the query, rebuild the
> boundary, re-run that province's panorama index. It costs Mapillary tile
> requests against a 50,000/day cap, which is why it is not done automatically.
>
> Before treating an empty district as a bug, check `missingParts` in its
> province's boundary file — that distinguishes the third case from the first two.

Naming Cu Chi explicitly is deliberate: an unnamed "known case" becomes a mystery
in six months. Cross-check the `missingParts` value at write time — Phase 1 may
have added unresolved leaves beyond Cu Chi.

Add a one-line pointer in `scripts/build-region-boundaries.mjs`'s `REGIONS`
config so a reader arriving from the code finds the note.

## Docs impact

| File | Change |
|---|---|
| `docs/project-overview.md` | "5 major cities" → the tree. The coverage note. Replace "Triple-Leaderboard System" with the rollup model. Note the pre-2025 basis |
| `docs/features.md` | **Rewrite Location Coverage and Street View System** — the dart-throw and per-city delta content is obsolete. Add the fan-out: one guess credits leaf, province, country. Record that `VN` is an exploration mode that scores 0 |
| `docs/game-flow.md` | Selection is country/province/district; the round reveals the resolving district |
| `docs/project-structure.md` | `src/data/regions/`, renamed and new scripts, `src/lib/regions.js`, `scripts/lib/`, the renamed coverage route |
| `docs/development.md` | Build sequence: boundaries → panorama index → district assignment. The migration, its dry-run default, and deploy-then-migrate ordering. The two new Radix dependencies |
| `CLAUDE.md` | Quick Reference only if a command name changed |

Link to scripts rather than restating their flags — they carry header comments,
and duplicating them guarantees drift.

## Stale-vocabulary sweep

Corrected against actual grep results; the earlier draft's expectations were
wrong in two rows.

| Pattern | Expected outcome |
|---|---|
| `build-city-boundaries` | Zero hits. Real reference set is 5 sites: `scripts/build-city-boundaries.mjs:9,197`, `scripts/build-pano-index.mjs:12,160`, `src/data/boundaries/index.js:1`. **Not in `docs/`** — the earlier claim was false |
| `city-coverage` | Zero hits outside git history. One caller: `src/app/debug/coverage/page.js:59` |
| `cityCode` | Only in `src/lib/upstash.js`'s namespace comment and the `/api/guess` legacy-session fallback |
| `CITIES` | Only as the derived back-compat export in `src/lib/game.js`, or gone if Phase 5 removed the last consumer |
| `cityNames`, `cityCenters`, `cities` | Consumers migrated; delete any export with no caller |
| `cityBboxes` | **Already dead** — `src/lib/game.js:64` is the only site. Delete it |
| `indexedCities` | **Already dead** — `src/lib/pano-index.js:58` is the only site. Delete it, or keep it if Phase 1's test now uses it |
| `5 cities`, `five cities`, `major cities` | Zero hits in `docs/`. Only genuine hit today is `docs/project-overview.md:3` |
| `Dart-throw`, `delta` | Zero hits — obsolete strategy still documented in `docs/features.md` |
| `leaderboard:city:` | Present and **correct** — do not rename |
| `/api/regions` | Zero hits — the route was removed during red-team |

Deleting the back-compat exports is the point of the sweep. They exist so phases
1-4 could land without breaking the UI; once Phase 5 is in, leaving them is dead
code that invites new callers back onto the flat model.

## Related Code Files

- Modify: `docs/project-overview.md`, `docs/features.md`, `docs/game-flow.md`,
  `docs/project-structure.md`, `docs/development.md`
- Modify: `CLAUDE.md` (only if a command name changed)
- Modify: `scripts/build-region-boundaries.mjs` — pointer comment
- Modify: any file surfaced by the sweep

## Implementation Steps

1. Read each doc before editing, then reconcile against the **shipped code** —
   not against this plan, which is a record of intent and may have been amended
   during execution.
2. Write the coverage note; verify its `missingParts` claim against the actual
   boundary files.
3. Run the sweep table top to bottom.
4. Delete back-compat and dead exports.
5. Whole-plan consistency check: re-read `plan.md` and phases 1-5, reconcile
   anything execution changed.
6. Full gate: `npm run lint`, `npm test`, `npm run test:integration`
   (`npm run redis:up` first), `npm run build:check`.
7. Verify each of `plan.md`'s success criteria against live state, with evidence
   — a command, a key, or a screen. Not against the phase checkboxes.
8. `npm run redis:down`.

## Validation

- The coverage note names all three causes and the current `missingParts` reality.
- Every sweep pattern lands on its expected outcome.
- Every `/docs/` statement about coverage, scoring, or the pipeline is true of the
  shipped code — in particular `docs/features.md` no longer describes dart-throw.
- All four gate commands exit 0.
- Every `plan.md` success criterion verified against live state, with evidence.
- No background processes left running.

## Risk Assessment

**Docs get updated from the plan rather than the code.** The plan states intent
written before implementation; anything the phases amended would be copied in as
a false claim. *Signal:* a doc statement no grep or command can confirm.
*Response:* step 1 makes code the source; every claim needs a citable file or
command.

**Back-compat exports get left in "just in case".** *Signal:* `cityNames` still
exported with zero callers. *Response:* delete. Git history is the safety net.

**The coverage note drifts.** It is prose, and `docs/features.md` proves prose
drifts here. *Signal:* a future maintainer adds a province and the note still says
five. *Response:* the note leans on `missingParts` and the generated tree for its
specifics; keep counts out of the prose where the data already carries them.

**The integration container stays up.** *Signal:* a Redis container still running.
*Response:* `npm run redis:down` is step 8, not an afterthought.

## Success Criteria

- [ ] The coverage note is written, classifies all three causes, and names Cu Chi
- [ ] All five `/docs/` files describe the region tree accurately
- [ ] `docs/features.md`'s obsolete dart-throw content is gone
- [ ] Every sweep pattern resolves to its expected outcome
- [ ] Dead and back-compat exports deleted
- [ ] `npm run lint`, `npm test`, `npm run test:integration`, `npm run build:check` all pass
- [ ] All `plan.md` success criteria verified against live state
- [ ] No background processes left running
