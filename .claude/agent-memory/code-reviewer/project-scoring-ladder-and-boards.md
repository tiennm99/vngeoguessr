---
name: project-scoring-ladder-and-boards
description: One frozen scoring ladder for every region (the per-region bbox ladder was reverted), and the top-200 trim that permanently resets any player outside the window
metadata:
  type: project
---

**Superseded 2026-09-20.** The per-region bbox ladder recorded here on
2026-08-31 (`calculateScore(distance, bands)`, `bandsForBbox`) no longer exists;
commit `b15d199` "score every region on one distance ladder" reverted it. Verify
before quoting any ladder claim — this area has flipped once already.

Current state, read from source 2026-09-20:

- `SCORE_BANDS` in `src/lib/game.js` is a frozen 50/100/200/500/1000 m ->
  5/4/3/2/1 ladder. `calculateScore(distance)` takes distance only.
- `/api/guess` grades the headline `gameResult.score` with it, and
  `submitRoundScore` credits district, province and country with the SAME
  points from the same raw distance. Every level of one round records an
  identical number.

**The trim is a ratchet, and it is the finding worth remembering.**
`creditScore` (`src/lib/leaderboard.js:130-154`) does `zScore` -> `zAdd(existing
+ points)` -> `zRemRangeByRank(key, 0, -(201))`. A player whose new total lands
outside the top 200 is deleted from the sorted set, so their next round reads a
null score and starts from zero. Their ceiling is one round's points, max 5.
Once 200th place holds more than 5 points the board is closed to new players
permanently. The `trimmed` flag only hides the number in the UI; it does not
preserve the total anywhere.

**Why it matters:** this is a growth/retention defect disguised as a storage
optimisation, and no test covers it (the leaderboard suite never exceeds 200
members).

**How to apply:** when anything touches leaderboard writes, ask where a
non-top-200 player's total lives. Also note the read-modify-write in the same
function is not atomic — concurrent rounds under one username lose an update;
`upstash.js` has no `zIncrBy` yet. Related: [[project-anti-cheat-invariant]].
