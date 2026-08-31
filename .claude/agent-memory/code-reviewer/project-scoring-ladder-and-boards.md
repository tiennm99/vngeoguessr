---
name: project-scoring-ladder-and-boards
description: Scoring is region-relative and each board is credited by its OWN ladder as of 2026-08-31 - what that did to the country board, and what the headline score now means
metadata:
  type: project
---

As of 2026-08-31 there is no single scoring ladder. `calculateScore(distance,
bands)` takes one, `bandsForBbox(bbox)` builds it from a region's bbox diagonal
(reference 10 km, factor clamped at >= 1), and there are two different consumers:

- `/api/guess` grades the HEADLINE `gameResult.score` against the region the
  player PICKED. This number is credited to no board — it is display only.
- `submitRoundScore` credits each board from the raw distance against THAT
  board's own ladder, so a country round can no longer buy district points.
  Each level's award comes back as `levels[].points`.

**Why:** without scaling, a country round was a guaranteed string of zeros. The
first fix (picked-region ladder + flat fan-out) let a country round credit
district boards at country precision; the per-level fan-out closed it.

**How to apply:** measured ladders — country 5 pts <= 6,380 m, TPHCM 442 m,
TPHCM-Q7 62 m, HN-BADINH 50 m. `SCORE_BANDS` is NOT "the district ladder", and
calling it that in UI copy or docs is wrong: only 20 of 58 playable districts sit
at factor 1.00; median is 1.51 (TPHCM-BINHTAN, 15.1 km) and max 4.73
(TPHCM-CANGIO, 47.3 km). It is the ladder for any region up to a 10 km diagonal.
Consequence the user has not explicitly signed
off: the Vietnam board now pays +5 for any guess within 6.4 km, so it measures
rounds played rather than accuracy, and mixes with points banked under the old
50 m ladder. Anything that bands, colours, or labels a score must say which
ladder it means; the boards store no record of which one applied. Related:
[[project-anti-cheat-invariant]] (`bands` leaks nothing — the picked region is
already client-side).
