---
name: project-architecture-review-2026-09
description: Architecture review given 2026-09-21 on dev (77654d2) — verdict "no rewrite", four pre-feature refactors (envelope slimming, typed error seam, dead-surface sweep, GameClient staged extraction), explicit "never" list
metadata:
  type: project
---

On 2026-09-21 Kongming reviewed the whole architecture on `dev` at 77654d2
(report: plans/reports/advisory-260921-1529-architecture-review.md). Verdict: no part
warrants a rewrite. Recommended before the next feature: (1) slim the `/api/guess` and
`/api/leaderboard` envelopes and delete `fanOutScore` aliases / `submitScore` / `message`;
(2) a typed error seam (`src/lib/errors.js`) replacing eight string-match sites, with
outage-vs-coverage separation on `/api/new-game` and one request-wide Mapillary deadline;
(3) dead-surface sweep (`?city=`, `type`/`cityCode`, `POST /api/new-game`, unused
`@radix-ui/react-tabs`, docs drift); (4) staged `GameClient` extraction (GameHeader, then a
`use-round.js` hook as a pure move) — 4(b) only as a prerequisite to the 5-round run.
Explicit "never" list: reducer rewrite of GameClient, one-store consolidation, vitest
`setupFiles` mock centralisation, removing `/game?region=`, renaming Redis keys, touching the
two-ThemeToggle pattern.

**Why:** Solo maintainer shipping in weekend bursts; e2e cannot run on the server; the
seams that matter (server-only index, atomic session claim, adapter-owned prefix,
best-effort wrappers) are already test-enforced. Accumulated debt is surface, not structure.

**How to apply:** Before re-advising, check `git log` for which of items 1-4 shipped
(grep `globalRank` in `src/app/api/guess/route.js`, `submitScore` in `src/lib/leaderboard.js`,
existence of `src/lib/errors.js` and `src/app/components/use-round.js`). Treat the "never"
list as standing counsel unless the maintainer brings new evidence (e.g. a second API consumer
or the 5-round run turning the round into a nested state machine). Related: [[project-roadmap-counsel-2026-09]].
