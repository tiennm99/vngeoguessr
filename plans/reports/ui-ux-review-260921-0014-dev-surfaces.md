# UI/UX review — `dev` player-facing surfaces

Date: 2026-09-21 · Scope: daily mode (card, route, dialog), Share, failure/hit copy, header collapse, Vietnamese names, compact ThemeToggle, Unicode usernames. Method: source only (no browser on this host). Read-only; nothing merged or changed.

Prior audit checked: `ui-ux-review-260920-2201-improvement-brainstorm.md`. Width figures are from class values, not measurement.

## 1. Findings

### HIGH

**H1. "One guess" is never stated before the guess.** Daily is one attempt (`GameClient.js:213-226` replays the stored result; `docs/features.md:186` "No skipping"), but the player is told only after: card copy `DailyCard.js:79` says "One street view, the same for everyone" — nothing about one guess; in-game the only signals are a missing Skip and a "Daily #N" badge; `FirstRoundHint.js:58-61` is the generic hint; the dialog line `RoundResultDialog.js:196` arrives after the fact. A first-timer who drops a quick pin to "see what happens" has spent the day.
Fix: card sub-copy "One street view, one guess, the same for everyone. Resets at midnight, Vietnam time."; in daily the Submit label reads `Submit final guess` (`GameClient.js:677`); optional one-line daily hint in `topBarSlot`.

**H2. Share outcome is inaudible, and on phones sometimes invisible.** `RoundResultDialog.js:357-368`: `aria-label` overrides the sr-only `Copied/Retry/Share` span, so a screen reader never gets the state; a name change on the focused button is not reliably announced. Below `sm` the `failed` state shows the same Share icon — no feedback at all. `share.js:175` returns `failed` on `AbortError`, so closing the share sheet flips the desktop label to "Retry" for a non-error. `DailyCard.js:86-89` repeats it: static label "Share today's result", no failed state.
Fix: drop `aria-label`, let the visible/sr-only text name the button; add a sibling `<span role="status" className="sr-only">` with "Result copied to clipboard" / "Could not copy — try again"; swap the icon on `failed` (e.g. `AlertCircle`); return `'cancelled'` for `AbortError` and leave the button untouched. Same treatment in `DailyCard`.

### MEDIUM

**M1. Failure copy tells a daily player to "start a new one."** `RoundResultDialog.js:19,27` — in daily there is no Next/Skip, "Done" goes home, and a failed round is not stored (`GameClient.js:363-370` saves only on success), so the honest instruction is to reopen `/daily`.
Fix: branch by `daily`: "Nothing was scored. Reopen today's challenge to try again."

**M2. DailyCard played-state buttons are 36px.** `DailyCard.js:86,90` use `size="sm"`; `button.js:41-42` says sm is "never the sole tap target on a screen" — here they are the card's only targets on phones.
Fix: default size; below `sm` let the pair take the full second row (`w-full sm:w-auto`, `flex-1`).

**M3. Result-dialog action row is over budget at 360px.** `RoundResultDialog.js:348-375`. Dialog `calc(100%-2rem)` = 328, `p-6` → 280px. Share: `size="lg"` keeps `has-[>svg]:px-5` (the `px-3` override only replaces `px-6`) ≈ 56px. Next Round min-content ≈ 136px (text-base, `px-6`, `whitespace-nowrap`). Menu ≈ 72px. Two `gap-3` = 24. Total ≈ 288 > 280, and every button is `shrink-0` (`button.js:18`), so the row overflows instead of squeezing. Menu is also `h-11` between two `h-12` buttons.
Fix: Share `className="size-12 px-0"`, Next Round `px-4 sm:px-6`, Menu `size="lg"`. Confirm on device (§4).

**M4. "Right province, wrong district" when there is no district.** `region-locate.js:56-58` returns `province` whenever provinces match and the answer is not a district — including answers that only resolve to a province. Copy then asserts a wrong district that does not exist.
Fix: in the dialog, show "Right province" when `result.resolvedPath.length < 3`; or have `regionHit` return a fourth value for province-level answers.

**M5. Streak badges rely on emoji + `title`.** `GameClient.js:474-477`, `DailyCard.js:71-73`, `RoundResultDialog.js:195`. `title` is hover-only; a reader hears "fire 3".
Fix: `aria-label="3-day streak"` on the badge (or sr-only "-day streak"), drop `title`. In the dialog line, move 🔥 after the text or mark it `aria-hidden`.

### LOW

- **L1** "Play today's" (`DailyCard.js:103`) is a dangling possessive → "Play today's challenge".
- **L2** `truncate` on the inline-flex Badge (`GameClient.js:466`) clips without an ellipsis: `text-overflow` needs a block container. Latent today (longest `nameVi` "Thủ Dầu Một" fits `8rem`); wrap the text in `<span className="truncate">` before longer names land.
- **L3** Two `prefers-reduced-motion` blocks both zero `.animate-fade-in-up` (`globals.css:334-345, 351-357`); merge. New dialog `animate-fade-in-up` uses (`RoundResultDialog.js:167-198`) are covered; the keyframe has no resting `opacity:0`, so nothing stays hidden. Count-up is guarded (`use-count-up.js:36-40`).
- **L4** Compact ThemeToggle wraps one button in `role="group"` (`ThemeToggle.js:73`); drop the group in compact mode. Label "Theme: Light. Switch to Dark" is good.
- **L5** Failure body has `role="alert"` (`RoundResultDialog.js:161`) while `DialogDescription` already carries the same sentence → double announcement. Drop the role.
- **L6** Vietnamese names sit in a `lang="en"` document (`layout.js:78`); a `<span lang="vi">` around `regionName()` output (one `RegionName` component) fixes pronunciation.
- **L7** DailyCard first paint is always the Play row, then swaps to the played state after mount (`DailyCard.js:28-41`) — a layout jump for returning players. Render the action slot `invisible` until `state` is set.
- **L8** Header badge reads "Daily" then "Daily #N" once the round lands (`GameClient.js:471`); reserve the width or show the number from `dailyNumber(dailyDay())` immediately, as the card does.

Copy otherwise consistent: English UI, Vietnamese place names, "Vietnam" for the country; username help text (`UsernameModal.js:89`) still true under the Unicode rule; failure titles honest and reason-specific.

## 2. Prior findings

Closed by this diff: **H1** header overflow (compact Theme + Sound below `sm`, badge cap, tally hidden `<sm`, Beer icon-only — ≈348px in daily/region mode at 360px, fits). **H3** expiry copy (`reason` carried, two variants). **M3** per-board "own scale" titles gone. **M4** Unicode usernames + Geist `vietnamese` subset. Forward ideas 1 (region hit), 4 (share line), 8 (daily) shipped.

Partially: **M1** — the daily Play row is now the first CTA (~400px down at 360px, above a 667px fold), but the home header still wraps 2–3 rows (`page.js:347-374`, full Theme + Sound + chip + Leaderboard + Beer) and How to Play still precedes Where to Play.

Still open: **H2** keyboard-only guess; **M2** ladder under "Leaderboard results" (`RoundResultDialog.js:257`); **M5** leaderboard `min-w-[104px]` (`LeaderboardModal.js:109`); **M6** no fetch timeout (`GameClient.js:66`); **M7** dialog overlay/content not in the reduced-motion block (`dialog.jsx:41,60`); **L1** coordinate footer (`ResultMap.js:127-130`); **L2** `-ring-offset-1` (`LeaderboardModal.js:118`); **L4** minimap `aria-expanded`; **L6** RegionPicker docblock (`RegionPicker.js:119`); **L9** Skip still `outline` (`GameClient.js:685`). **M8** not re-examined.

## 3. Top 3

1. **H1** — one sentence on the card and a Submit label; prevents the only irreversible mistake a new player can make in the new feature.
2. **H2 + M5** — share and streak feedback for non-sighted users; small, same pattern in three places.
3. **M3 + M2** — the dialog action row and the card buttons at 360px; the two new touch surfaces most likely to misbehave on the most common device.

## 4. Needs a real device

1. Result-dialog action row at 360/375/390: overflow or squeeze, and the Menu/Next height mismatch (M3).
2. Game header at 360 in daily mode with the streak badge; whether "Daily #12" + 🔥 pushes the compact toggles.
3. DailyCard wrap at 360–414: where the Play link lands on the second row; whether right-aligning it (`ml-auto`) reads better.
4. Share sheet on iOS Safari: whether `navigator.share` with `{ text }` only shows the link as tappable, and what the cancel path returns.
5. Geist `vietnamese` glyphs on iOS/Android for "Đống Đa", "Thủ Dầu Một" in badges and the reveal path (impl report also flags this).
6. Whether `animate-in` (tw-animate) respects reduced motion on its own (prior M7 assumption).

---

Status: DONE_WITH_CONCERNS
Summary: Code-only review of the `dev` surfaces: 2 high, 5 medium, 8 low findings with file:line and fixes; prior H1/H3/M3/M4 confirmed closed, M1 partial, ten prior items still open. Report at `/workspace/tiennm99/vngeoguessr/plans/reports/ui-ux-review-260921-0014-dev-surfaces.md`.
Concerns/Blockers: all width/overflow figures derived from class values; §4 lists what needs one device pass. No e2e spec covers `/daily`.
