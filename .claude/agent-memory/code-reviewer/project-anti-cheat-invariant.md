---
name: project-anti-cheat-invariant
description: The panorama index is the answer to every round; the client-safety import walk does not cover the API surface, and /api/debug/city-coverage is an open bypass
metadata:
  type: project
---

The panorama indexes under `src/data/panos/` are ~29 MB of exact round answers. The
team's stated invariant is that `src/lib/regions.js` (client-imported) must never
transitively reach them, enforced by the "client safety" import walk in
`tests/regions.test.js`.

**Why:** a client that can map a panorama id to coordinates scores perfectly every round.

**How to apply:** the bundle-graph walk is only half the boundary. Verified 2026-08-30:
`/api/debug/city-coverage` is unauthenticated, has no `NODE_ENV` gate and no middleware,
and returns up to 40,000 exact `{id, lat, lng}` entries filtered by an arbitrary `bbox`.
`/api/new-game` hands the client the panorama id. So the answer is reachable without any
bundle leak. When reviewing changes near regions/pano-index/new-game, check the API
surface too, not just the import graph, and do not treat a passing import-walk test as
proof the property holds.
