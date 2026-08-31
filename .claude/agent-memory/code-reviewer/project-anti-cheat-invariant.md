---
name: project-anti-cheat-invariant
description: The panorama index is the answer to every round; the client-safety import walk does not cover the API surface, and the debug coverage route is an open, now district-granular bypass
metadata:
  type: project
---

The panorama index is the exact round answers. As of 2026-08-31 it is a Neon
Postgres table (`panoramas`), reached through `src/lib/pano-db.js` and
`src/lib/pano-index.js`; the old ~29 MB `src/data/panos/*.json` are deleted and
the pipeline now writes gitignored `data-build/panos/`. The team's stated
invariant is that `src/lib/regions.js` (client-imported) must never transitively
reach them, enforced by the "client safety" import walk in `tests/regions.test.js`
and `tests/geo-search.test.js`, whose forbidden list now includes `pano-db`.

**Why:** a client that can map a panorama id to coordinates scores perfectly every round.

**How to apply:** the bundle-graph walk is only half the boundary. Verified 2026-08-30:
the debug coverage route (`src/app/api/debug/region-coverage/route.js`, renamed from `city-coverage` on 2026-08-30, and it now accepts only `?region=`) is unauthenticated, has no `NODE_ENV` gate and no middleware,
and returns exact `{id, lat, lng}` entries. `/api/new-game` hands the client the
panorama id, so the answer is reachable without any bundle leak. Phase 4 widened that
route from 5 province codes to every code with a boundary (65), so a caller can now pull
a district's list complete and unsampled in one request. The user has accepted this
exposure; do not re-litigate it, but when reviewing changes near regions/pano-index/
new-game, check whether the change makes extraction cheaper, and never treat a passing
import-walk test as proof the property holds.

Since the move to Postgres that route also has a cost dimension: each unauthenticated
call runs a `row_number() OVER (ORDER BY lat, id)` over the whole region (226k rows for
HN) on metered Neon compute. Extraction now bills the project, not just leaks.
