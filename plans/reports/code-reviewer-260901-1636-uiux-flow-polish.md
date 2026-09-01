# Code Review — UI/UX flow polish and legacy cleanup (phases 1-3 + 4.1)

Date: 2026-09-01
Scope: uncommitted working tree, `D:/tiennm99/vngeoguessr`
Plan: `plans/260901-1636-uiux-flow-polish-and-legacy-cleanup/`

## Scope

- 23 modified + 2 new source/test files, ~564 insertions / ~251 deletions
- Focus: pending changes only (`git diff`, no staged content)
- Verification re-run: `npx vitest run tests/username.test.js tests/guess-route.test.js` (9 pass), `npm run lint` (0 errors, 19 warnings). Build/e2e not re-run per instruction.

## Overall Assessment

The diff does what the plan says, and the risky parts are the ones the plan called
risky. The round state machine is genuinely untouched, all public contracts hold,
and the Phase 4 fallback removal is provably safe. Comment quality is high and
explains constraints rather than narrating.

Two classes of defect remain: one real interaction bug in the new hint overlay on
mobile, and a set of documentation surfaces that now describe behavior and CSS
class names that no longer exist. Neither is a data or security problem.

No CRITICAL findings.

---

## HIGH

### H1 — `FirstRoundHint` blocks the expanded guess map's controls on mobile

`src/app/components/GameClient.js:447` renders `<FirstRoundHint>` as a direct child
of the `relative flex-1` game container with `absolute left-1/2 top-3 z-[700]`
(`src/app/components/FirstRoundHint.js:47`).

`GuessMapPanel`'s root is `absolute z-[500]` on phones
(`src/app/components/GuessMapPanel.js:46`). A positioned element with a numeric
`z-index` creates a stacking context, so the panel's own `z-[1200]` children — the
search box (`GuessMapPanel.js:65`) and the collapse button (`GuessMapPanel.js:101`,
`top-2 right-2 size-11`) — are clamped inside `z-500` and paint **below** the hint.

Expanded, the mobile map occupies `inset-x-3 top-3`. The hint sits at exactly
`top-3`, centred, `w-max max-w-[calc(100%-1.5rem)]` — on a 360-390px viewport it
wraps to ~2 lines spanning nearly the full width, directly over the search box and
the collapse button. The hint wrapper is **not** `pointer-events-none`, so it
intercepts those taps.

Sequence that reproduces: fresh profile → `/game?region=…` → "Tap to guess" →
map expands → search and collapse are unreachable until the player either taps the
hint's own X or drops a pin. This is exactly the target audience (first-time,
deep-linked player) hitting a dead control.

Desktop is only a cosmetic overlap: `lg:z-auto` on the panel removes the stacking
context, so the `z-[1200]` search box paints over the hint. The hint text is
partially hidden behind the search box at the column seam, but nothing is blocked.

Fix options (any one):
- Gate the hint on the collapsed state: pass `mapExpanded` down and render `null`
  when the map is expanded.
- Add `pointer-events-none` to the wrapper and `pointer-events-auto` on the X.
  Fixes the blocking, not the visual collision.
- Move the hint to `bottom-` on `<lg` (the collapsed minimap already lives at
  `bottom-[calc(5.25rem+…)] right-3`, so a bottom-left placement is clear).

Note the plan's own edge-case checklist asked specifically whether the hint blocks
the minimap tap target. It does not block the *collapsed* minimap — it blocks the
*expanded* map's chrome, which the check did not cover.

---

## MEDIUM

### M1 — `docs/development.md:208` documents a class that no longer exists

`- **Page background**: \`min-h-dvh vn-gradient-bg\` on the page root.`

Phase 3 renamed the class to `.vn-surface` (`src/app/globals.css:251`) and updated
every call site. The doc is the only surviving reference and now instructs future
contributors to apply a class that resolves to nothing. Docs are in the plan's
allowed-modification set (`plan.md:24`) and this is a user-visible-convention
change, so per `documentation-management.md` it should have been updated with the
rename.

### M2 — `docs/development.md:220-225` contradicts Phase 3's whole premise

> Raw palette colors are allowed only where the color itself is the meaning and
> must not follow the theme: score bands and podium colors (`RoundResultDialog.js`,
> `LeaderboardList.js`, always with a `dark:` variant) …

Both named files were migrated off raw palettes onto `--success/--warning/--danger/
--rank-*` in this diff. The doc now points a future contributor back at the exact
pattern Phase 3 removed, and the new tokens are documented nowhere. The
`bg-neutral-900` panorama surround exception is still valid and should stay.

### M3 — `docs/game-flow.md:5-8` describes the removed on-landing prompt

```
### 1. Username Setup
- Check localStorage for existing username
- Display UsernameModal if not set
```

This is precisely the behavior Phase 2 deleted (`src/app/page.js:47-50`). The flow
is now: landing renders with no modal → first Play click intercepts → save or skip
into a generated name → navigation resumes. `docs/game-flow.md` is the canonical
description of the player flow; a user-visible flow change is exactly the trigger
the docs rule names.

### M4 — Home header row overflows on small phones now that the chip is always visible

`src/app/page.js:90` — the inner `<div className="flex items-center gap-3">` has no
`flex-wrap`, and every child is `whitespace-nowrap` (shadcn `Button`). Contents:
ThemeToggle (3 × 44px = 132px, now wider after F16's `w-9`→`w-11`), the name chip
(up to `"Playing as "` + 20 chars ≈ 190px with `px-2`), "Leaderboard" (~130px),
"Buy me a beer" (~155px), plus 3 × 12px gaps ≈ 640px inside a ~328px container at
360px viewport.

The row already overflowed before this diff (~440px), but the previously
`hidden sm:inline` name span is now unconditional and adds up to ~190px, plus
+6px from the toggle widening. The chip also has no `max-w`/`truncate`, so a
20-character name renders in full.

Phase 1 explicitly required the chip on mobile, so the requirement is right; the
layout needs to absorb it. Suggested: `flex-wrap` on the inner div plus
`max-w-[10rem] truncate` on the chip, or drop the `"Playing as "` prefix below
`sm` and show just the name.

### M5 — The session badge labels the headline score as "pts", which no board receives

`src/app/components/GameClient.js:270` sums `submitted.score` and
`GameClient.js:423` renders it as `N rounds · M pts`, tooltip
`"M points in N rounds this visit"`.

`score` is `finalScore` from `src/app/api/guess/route.js:74` — graded on the
*picked* region's ladder and, per the route's own comment at lines 97-100,
credited to **no** leaderboard. The dialog's "Leaderboard points added" section
shows per-board `entry.points`, which are different numbers for the same round.
Two adjacent surfaces now both say "points" and mean different things — and this
dialog exists precisely to explain that distinction (the `(+N)` tooltip at
`RoundResultDialog.js:239` says "Each board grades your distance on its own
scale").

This matches the plan's wording ("points sum from each submitted result"), so it is
a judgment call rather than a deviation. Recommend relabelling the badge to
`N rounds · M score` (or "round score") and adjusting the tooltip, so the only
thing called "points" in the UI is what actually lands on a board.

### M6 — The new localStorage key breaks the repo's storage-key convention and is duplicated

`src/app/components/FirstRoundHint.js:6` declares `HINT_STORAGE_KEY` privately
inside a component. Every other storage key in the codebase is an exported constant
in `src/lib/`:

- `src/lib/username.js:5` `USERNAME_STORAGE_KEY`
- `src/lib/last-region.js:4` `LAST_REGION_STORAGE_KEY`
- `src/lib/theme.js:8` `THEME_STORAGE_KEY`

Because it is not exported, `tests/e2e/helpers.js:21` re-declares the literal
`'vngeoguessr_hint_seen'`. Two sources of truth for a persisted key: renaming it in
one place leaves a silently-passing e2e helper that seeds a dead key, and the specs
would then race the banner exactly as `seedHintSeen` was written to prevent.

Fix: move the constant (and ideally `getHintSeen`/`setHintSeen`) to
`src/lib/hint.js` alongside the siblings, import it in both places.

### M7 — Generated names collide and silently merge leaderboard identities

`src/lib/username.js:22-27` produces `Player-` + 4 base36 chars → 36⁴ = 1,679,616
values. Leaderboard identity is the raw username string used as the ZSET member
(`src/lib/leaderboard.js:138-143`), so two players who both skip into the same
generated name share one board row and accumulate a merged score.

By the birthday bound, ~1,530 skipping players gives a ~50% chance of at least one
collision; ~100 gives ~0.3%.

Mitigating context: typed names already collide freely (there is no uniqueness
constraint anywhere), so this is not a new *class* of defect. The difference is
that these collisions are machine-assigned and invisible to the player.

Mitigation is one character: 6 chars → 36⁶ = 2.18B, still inside the modal's 2-20
length rule, still matched by the existing regex tests (the assertion at
`tests/username.test.js:18` would need `{6}`). Worth taking given the cost.

---

## LOW

- **L1 — Modifier-click on a Play row is hijacked.** `src/app/components/RegionPicker.js:57-59`
  calls `e.preventDefault()` unconditionally when intercepting. Ctrl/Cmd+click fires
  `onClick`, so "open the round in a new tab" instead opens the name modal in the
  current tab. Guard with `if (e.metaKey || e.ctrlKey || e.shiftKey) return;`.
- **L2 — "Skip — random name" from the header chip assigns an unrequested name.**
  `src/app/components/UsernameModal.js:65-68` picks the secondary action from
  `hasExistingName` alone. With no name saved, opening the modal from the "Set name"
  chip (no `pendingHref`) still offers Skip, which persists a generated name and
  closes. Consider keying the label off whether a navigation is pending, not just
  off the stored name.
- **L3 — `leaderboardMessage` moved behind the collapsed section.**
  `src/app/components/RoundResultDialog.js:269-271`. Phase 2 named the bands strip and
  the two grids; the message ("Score added at 3 levels (+4, +5, +5)") was not listed
  but went in too. Defensible as bookkeeping — flagging so it is a decision, not a
  side effect.
- **L4 — `<summary>` has no focus-visible ring.** `RoundResultDialog.js:182` uses
  `list-none` + `min-h-11` but omits the repo's `focus-visible:ring-[3px]
  focus-visible:ring-ring` idiom used on every other custom control
  (`page.js:98`, `FirstRoundHint.js:59`, `RegionPicker.js:60`). Keyboard toggling
  works natively; only the focus indicator falls back to the UA default.
- **L5 — "YOU" row is now less distinguishable from the podium rows.**
  `src/app/components/LeaderboardList.js:74-77`: `bg-brand-subtle/70 border-2 border-brand`
  vs `bg-brand-subtle/40 border border-brand/20`. Same hue, differing only in opacity
  and border weight, where it used to be amber vs brand. The `YOU` badge still
  disambiguates, so this is cosmetic.
- **L6 — Opening `<details>` does not scroll the revealed content into view.** Inside
  `overflow-y-auto max-h-[calc(100dvh-2rem)]` (`RoundResultDialog.js:75,104`), the
  summary sits near the bottom on a phone; expanding may appear to do nothing.
- **L7 — The hint renders over the load-error panel and the round spinner.**
  `GameClient.js:447` is outside any `loadError`/`roundLoading` guard.
- **L8 — `docs/project-structure.md:47-57` omits `FirstRoundHint.js`.** That list is
  already partial (`GuessMapPanel`, `RoundResultDialog`, `ResultMap`, `MapSearchBox`,
  `LeaderboardModal` are all missing), so this is consistent with the existing state
  rather than a regression.
- **L9 — `role="alert"` on the failed-round block** (`RoundResultDialog.js:109`)
  duplicates what the dialog already announces via `aria-describedby`
  (`RoundResultDialog.js:91-97`). Screen readers hear the failure twice.

---

## Verified Clean

Recording the verification source so these are not re-litigated:

**(b) Round state machine — no regression.** Walked `applyRound`
(`GameClient.js:108-124`), `loadRound` (126-142), `handleSubmitGuess` (260-298),
`resetRoundState` (303-307), `handleNextRound` (309-340), `handleSkipGuess`
(342-368), `handleRetryLoad`, and the watchdog (233-237). `roundEpochRef` /
`appliedEpochRef` comparisons, the prefetch hand-off, the `if (roundLoading) return`
double-click guard, and the `submitting` guard are all byte-identical. The only
changes are two `setSessionRounds`/`setSessionPoints` calls added inside the
existing `if (submitted)` branch (269-270) and the name generation inside
`submitGameResult` (184-189), which runs before the fetch and touches no round
state.

**(c) Public contracts — intact.**
- `/api/guess` response body unchanged, including the permanent legacy aliases
  `cityRank` / `cityDistanceRank` (`guess/route.js:132,134`).
- `/api/leaderboard` legacy `cityCode` alias untouched (`leaderboard/route.js:37`).
- No Redis key touched; `vngeoguessr:leaderboard:city:*` assertions still pass
  (`tests/guess-route.test.js:58-60`).
- `vngeoguessr_username` unchanged; `vngeoguessr_hint_seen` is purely additive.
- `?region=` and legacy `?location=` both still read at `GameClient.js:170-171`.
- The anti-cheat property still holds: `session.regionCode` is server-resolved and
  the request-body `regionCode`/`cityCode` are still ignored
  (`tests/guess-route.test.js:63-77` passes).

**Phase 4 step 1 is provably safe.** `src/app/api/new-game/route.js:45` rejects the
round with `if (!selectedImage.regionCode)` *before* writing the session, so no
session can exist without `regionCode`. The removed `?? session.cityCode` was
unreachable for any session creatable by the current release, and TTL is 30 min.
Deleting the compat test with the code is correct — it was asserting a shape the
system can no longer produce.

**(a) Phase acceptance criteria.** All Phase 1 items (F1, F2a, F5, F6, F7a, F8,
F9/F10, F11/F12, F14, F16, F19), all Phase 2 items (random name + unit test,
deferred modal, skip fallback, deep-link fallback, hint + ghost label, progress
badge, collapsible section, e2e updates), and all Phase 3 items are present in the
diff. F9/F10 in particular is genuinely fixed: the old `getScoreLabel` cutoffs
(`>=5/4/3/2/1`) and `getResultMessage` cutoffs (`>4/>2/>0`) disagreed; both now
derive from the single `SCORE_WORDING` table (`RoundResultDialog.js:24-36`).

**Phase 3 acceptance greps, run:**
- `grep -nE "(bg|text|border)-(green|emerald|amber|orange|purple|yellow|slate|blue|red)-[0-9]"` on
  `RoundResultDialog.js`, `LeaderboardList.js`, `ResultMap.js` → **no matches**.
- Emoji sweep over `src/**/*.js` → **no matches**.
- `vn-gradient-bg` in `src/` → **no matches** (only the doc, see M1).
- All four dialogs have a centred `text-2xl` title and a `DialogDescription`.

**New-token contrast, computed.** Light: `--success` L=0.55 → ~4.9:1 vs white;
`--warning` L=0.60 → ~4.0:1; `--danger` L=0.577 → ~4.3:1. All clear 3:1 for the
`text-3xl font-extrabold` score circle, and success/danger clear 4.5:1 outright.
Dark: on-colour text is `oklch(0.145 0 0)` against L=0.75-0.80 fills → 8-9:1. The
`--rank-silver` (L=0.71) tint sits on a decorative `aria-hidden` `<Medal>` icon
only (`LeaderboardList.js:83`), with the rank number rendered separately in
`text-foreground`, so the 3:1 non-text threshold is the applicable one and colour
carries no meaning alone.

**(d) Repo patterns.** JS only, no `.ts`/`.tsx`. Props-object destructuring matches
every existing component; the individual-parameter rule applies to `src/lib/`
functions and `generateRandomUsername()` takes none. Comments explain constraints
(stacking, hydration, epoch, why state must flip) rather than narrating.

**(e) Lint.** 0 errors, 19 warnings. Three are new
(`FirstRoundHint.js:23,36`, `UsernameModal.js:29`); all three are
`react-hooks/set-state-in-effect` on the same localStorage-read-in-effect pattern
already accepted at `ThemeToggle.js:29`, `RegionPicker.js:126`, `GameClient.js:172`,
`page.js:49`, `LeaderboardModal.js:64`, `MapSearchBox.js:42,52`. Acceptable — this
is the established idiom, not new debt.

**(f) Edge cases asked about:**
- `pendingHref` clears on overlay/Esc close — `page.js:191`
  (`onClose={() => { setShowUsernameModal(false); setPendingHref(null); }}`) is
  wired to Radix `onOpenChange`. Correct.
- `<details>` keyboard access — native `<summary>` focus + Enter/Space; `list-none`
  removes only the marker. See L4 for the missing focus ring.
- Hint vs minimap tap target — the *collapsed* minimap is clear; the *expanded* map
  is not. See H1.
- Dark-mode token contrast — computed above, clean.
- Random-name collisions — see M7.

---

## No security or data findings in this diff

Noting one pre-existing item found while checking the trust boundary, explicitly
**not** introduced here and **not** in scope: `/api/guess` validates only that
`username` is truthy (`guess/route.js:14`); the 2-20 char `[a-zA-Z0-9_-]` rule
lives solely in the client modal. Distance-board entries are encoded as
`username:distance:timestamp` and parsed with `.split(':')`
(`src/lib/leaderboard.js:106-107`), so a crafted request with a colon in the
username would corrupt that board's parsing. React escapes output, so there is no
XSS path. Raise separately if the operator wants it; do not bundle it into this
plan.

---

## Recommended Actions

1. Fix H1 — gate `FirstRoundHint` on the collapsed map state (or `pointer-events-none`
   + reposition below `lg`). Blocking for phase 2 sign-off.
2. Update the three doc surfaces: `docs/development.md:208` (M1),
   `docs/development.md:220-225` + a short semantic-token entry (M2),
   `docs/game-flow.md:5-8` (M3). Phase 3 and Phase 2 are not closeable without these.
3. Absorb the chip into the home header layout (M4).
4. Relabel the session badge away from "pts" (M5).
5. Move `HINT_STORAGE_KEY` to `src/lib/` and import it in the e2e helper (M6).
6. Widen the random suffix to 6 chars and update `tests/username.test.js:18` (M7).
7. Sweep the LOW items opportunistically; L1 and L4 are one-liners.

## Plan Status (reporting only — no plan files edited)

- Phase 1: all 11 steps present in the diff. Complete pending M1-M4.
- Phase 2: all 7 steps present. **Blocked on H1** before it can be called done.
- Phase 3: all 5 steps present, greps clean. Blocked on M1/M2 (the rename and the
  token migration are only half-landed while the docs still teach the old way).
- Phase 4: step 1 done and verified safe. Steps 2-3 correctly deferred behind the
  ops backfill gate; `scripts/migrate-leaderboards.mjs`,
  `scripts/lib/leaderboard-migration.mjs`, `tests/migrate-leaderboards.test.js`,
  the `leaderboard:migrate` npm script and the `docs/development.md` migration
  section are all still present, as intended.
- `plan.md` still reads `status: pending` and every phase file `status: todo` with
  unchecked Todo boxes. The lead/planner should update these — I did not.

## Unresolved Questions

1. M5: is "pts" in the header meant to read as the headline round score, or should
   it track something a board actually receives? The plan says the former; the UI
   wording implies the latter.
2. M7: is a machine-assigned name collision acceptable given typed names already
   collide, or is the 6-char widening worth taking now?
3. M3: should `docs/game-flow.md` also gain the deep-link/generated-name path, or
   is the landing flow description sufficient?

Status: DONE_WITH_CONCERNS
Summary: Phases 1-3 and phase 4 step 1 are faithfully implemented with the round
state machine and every public contract intact, but the new hint overlay blocks the
expanded guess map's search and collapse controls on phones, and three
documentation surfaces still describe the renamed CSS class, the removed raw-palette
convention, and the old on-landing username prompt.
Concerns/Blockers: H1 (mobile hint blocks map chrome) should be fixed before phase
2 is signed off; M1-M3 (stale docs) before phases 1-3 are closed.
