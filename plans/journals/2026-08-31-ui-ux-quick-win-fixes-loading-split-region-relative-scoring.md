---
title: "UI/UX quick-win fixes: loading split, region-relative scoring, per-level board ladders"
date: 2026-08-31
summary: Applied audited quick-win UI/UX fixes; review-driven pivot to per-level leaderboard ladders via submitRoundScore
---

# UI/UX quick-win fixes: loading split, region-relative scoring, per-level board ladders

## What happened
Three advisory agents (audit, research, brainstorm) converged on the same defects; applied the quick wins per plans/260831-1906-uiux-quick-wins/plan.md:

- Split GameClient's single `loading` flag into `initialLoading` / `roundLoading` / `submitting` / `loadError` — submitting a guess no longer unmounts the panorama viewer, and next-round loads show an overlay spinner.
- Region-relative scoring: `bandsForDiagonal`/`bandsForBbox` in src/lib/game.js scale the 0-5 ladder by the picked region's bbox diagonal (10km reference); `gameResult.bands` returned and rendered as a chip strip in the result dialog.
- Result dialog is non-dismissable (session already consumed); sr-only DialogDescription carries the outcome instead of a 60fps count-up inside aria-live.
- Panorama load failure: inline error panel with Retry/Back replacing `alert()` dead end.
- Next-round prefetch during the result dialog (metadata + image warm), "Continue in <region>" home row (src/lib/last-region.js), self-hosted Leaflet marker icons.

Gotchas hit: Turbopack dev returns a bare URL string for static PNG imports where webpack returns `{src}` — Leaflet threw "iconUrl not set" only in `next dev`; normalized with an `imageUrl()` helper. E2e strict-mode collision between the sr-only outcome text and the visible distance badge.

## Decision
Code review flagged a real asymmetry (H1): the picked-region ladder fanned out to district boards, making country rounds ~100x cheaper per district-board point. User chose per-level ladders: `submitRoundScore(username, distance, regionCode)` credits each board from the raw distance against that region's own ladder; the flat `submitScore` primitive remains for callers that already hold points. Headline score stays on the picked ladder; each level entry now carries `points`.

## Next steps
- Accepted, not fixed: roundLoading clears on fetch return, not panorama-visible (M2, pre-existing); LeaderboardList still colors distances with the unscaled base ladder; home table reads "1.00km+".
- Backlog from synthesis: 5-round set (M1), then daily challenge + emoji share grid; keyboard guess placement on the Leaflet map.
- Uncommitted; user to review and commit.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
