---
name: project-free-tier-budgets
description: The per-round cost of a completed game across Upstash, Neon and Mapillary, and the fact that no route is rate limited and nothing counts the spend
metadata:
  type: project
---

Measured by reading the call graph 2026-09-20: one completed round costs ~27
Upstash commands — 4 in `/api/new-game` (history GET, session SET, history
GET+SET) and 23 in `/api/guess` (session GET + DEL, then 3 levels x 4 commands
for the score fan-out and 3 x 3 for the distance fan-out). Upstash free is 500K
commands/month, so roughly 18.5K rounds/month, plus one Neon draw query and one
Mapillary lookup each.

No route is rate limited and there is no `middleware.js`. The three
`/api/debug/*` routes are unauthenticated, and `region-coverage` runs a window
function over a whole province partition (226k rows for HN) per call.

**Why:** the free tiers, not correctness, are the likeliest cause of a real
outage here, and the quota is spent per Redis COMMAND, not per HTTP request —
so pipelining hides latency but saves nothing.

**How to apply:** when reviewing anything that adds a Redis call inside the
round path, price it in commands/month, not in milliseconds. `zIncrBy` (absent
from `upstash.js`) and trimming less often are the two cheapest reductions.
Related: [[project-scoring-ladder-and-boards]], [[project-anti-cheat-invariant]].
