---
name: project-anti-cheat-invariant
description: The panorama index is the answer to every round; the client-safety import walk does not cover the API surface, and the debug coverage route is an open, now district-granular bypass
metadata:
  type: project
---

The panorama indexes under `src/data/panos/` are ~29 MB of exact round answers. The
team's stated invariant is that `src/lib/regions.js` (client-imported) must never
transitively reach them, enforced by the "client safety" import walk in
`tests/regions.test.js`.

**Why:** a client that can map a panorama id to coordinates scores perfectly every round.

**How to apply:** the bundle-graph walk is only half the boundary. Verified 2026-08-30:
the debug coverage route is unauthenticated, has no `NODE_ENV` gate and no middleware,
and returns exact `{id, lat, lng}` entries. `/api/new-game` hands the client the
panorama id, so the answer is reachable without any bundle leak. Phase 4 widened that
route from 5 province codes to every code with a boundary (65), so a caller can now pull
a district's list complete and unsampled in one request. The user has accepted this
exposure; do not re-litigate it, but when reviewing changes near regions/pano-index/
new-game, check whether the change makes extraction cheaper, and never treat a passing
import-walk test as proof the property holds.
