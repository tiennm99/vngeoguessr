---
name: project-roadmap-counsel-2026-09
description: Roadmap counsel given 2026-09-20 — recommended slice (hygiene+ratchet+stats counter, then 5-round run+share), five decision defaults, distribution-before-retention framing
metadata:
  type: project
---

On 2026-09-20 Kongming advised the maintainer on the improvement roadmap
(report: plans/reports/advisory-260920-2220-roadmap-counsel.md). Recommended: session A =
input validation, ZINCRBY + drop score-board trim (kills the top-200 ratchet), production
gate on /api/debug/*, daily stats hash (HINCRBY level:band + PFADD vng_pid); sessions B-C =
5-round run + summary + share text + display-only closeness/region-hit line. Defer daily
challenge until two weeks of counter baseline. Defaults offered: no trim, gate debug,
no accounts, scoring option 4a, music starts on Play click.

**Why:** Project is pre-revenue with a recorded "donation now, ads later" direction, so
distribution outranks retention; commit cadence is weekend bursts (2-3 sessions per
fortnight), so slices must be small. Traffic numbers were unknown at the time.

**How to apply:** In a future consult, first check which of these shipped (`git log`,
whether `leaderboard.js` still trims, whether a `stats:` key or `scripts/stats.mjs`
exists) and whether the maintainer overrode any default — treat overrides as decisions,
not mistakes. If the stats counter exists, ask for its numbers before re-advising.
