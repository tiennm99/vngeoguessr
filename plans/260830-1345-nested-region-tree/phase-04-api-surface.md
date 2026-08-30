---
phase: 4
title: "API surface"
status: todo
priority: P1
effort: "0.75d"
dependencies: [2, 3]
---

# Phase 4: API surface

## Overview

Carry the region tree through the route handlers. The session becomes the place
where "what the player picked" and "where the panorama actually is" are both
recorded — the second is what scoring fans out from, and **neither the client nor
any response may see it before the guess**.

No `/api/regions` route: the tree and its counts are two small generated files
the client imports directly (H5).

## Requirements

**Functional**
- `/api/new-game` accepts any playable region code and stores both the picked
  region and the resolved leaf.
- `/api/guess` fans out from the session's resolved leaf, never from client input.
- `/api/leaderboard` serves any validated region code.
- `/api/debug/city-coverage` serves any region with a boundary.
- The session is consumed before the leaderboard writes, so a retry cannot
  double-credit (H1).

**Non-functional**
- `?city=` keeps working everywhere it works today. `/game?location=HN` and
  `?location=DL` must not break.
- `session.regionCode` joins `exactLocation` on the never-serialized list.

## Architecture

### Session shape

```js
{
  sessionId,
  pickedRegion: 'TPHCM',      // what the player chose — safe to echo
  regionCode:  'TPHCM-Q7',    // SECRET: where the panorama is
  exactLocation: { lat, lng },// SECRET
  imageId,
  scored: false,
  createdAt,
}
```

`cityCode` is gone. Sessions live 30 minutes, so a deploy strands at most half an
hour of in-flight games: `/api/guess` reads `session.regionCode ?? session.cityCode`
so an old session still scores, at province level, instead of throwing. Remove
that fallback in a later release, and cover it with a test using a hand-crafted
old-shape session so it is not silently dropped.

### C6 — Two secrets, not one

The earlier draft guarded only `exactLocation`. `session.regionCode` names the
district the panorama is in; leaking it collapses a `VN` game from ~330,000 km²
to one district — reliably inside the 1 km band, often inside 200 m.

Two concrete leak paths, both closed here:

1. **`POST /api/new-game`** (the session-lookup path) returns
   `{ sessionId, cityCode, createdAt }` today (`new-game/route.js:111-119`). The
   mechanical rename `cityCode` → `regionCode` publishes the answer. It returns
   **`pickedRegion` only**.
2. **The GET response's `region` block.** It carries `pickedRegion`'s code, name,
   and ancestor path — never the resolved leaf. For a `VN` game the path is
   `['Vietnam']`, not `['Vietnam','Ho Chi Minh','District 7']`.

Both get an explicit test: no response body before the guess may contain the
value of `session.regionCode`.

### `/api/new-game`

```
GET /api/new-game?region=TPHCM-Q7[&sessionId=]
GET /api/new-game?city=TPHCM            # still accepted
```

Resolve through the tree, reject an unknown or non-playable code with 400, draw
via `fetchCityPanorama(code)` — which after Phase 2 returns the winning
candidate's `regionCode` — and store both values.

### C2 — the draw path

`/api/new-game` does not call `pickRandomPano`; `src/lib/mapillary.js` does, and
Phase 2 is where it starts propagating the leaf. This phase only consumes it. If
`imageResult.data.regionCode` is absent, that is a Phase 2 regression — fail loudly
rather than defaulting to the picked region, which would silently empty every
district board.

### `/api/guess` — H1

Order changes. Today: `submitScore` (`:65`) → `submitDistanceRecord` (`:68`) →
`deleteGameSession` (`:83`). A failure in the second leaves the score written and
the session replayable.

New order: mark the session consumed (or delete it) **first**, then write. A
replay finds no live session and is rejected. Losing a guess to a mid-write
failure is strictly better than double-crediting six keys.

The response's `gameResult` grows from two ranks to Phase 3's `levels` array,
keeping `globalRank` as an alias until Phase 5.

### `/api/leaderboard`

```
GET /api/leaderboard?region=TPHCM-Q7&type=score&limit=100
GET /api/leaderboard?city=TPHCM         # still accepted
GET /api/leaderboard                    # country
```

Validate against the tree and 400 on an unknown code — today an unknown value
silently returns an empty board, indistinguishable from a real empty one. Phase 3
also validates inside the library, since the route is not the only caller.

### H5 — no `/api/regions`

The earlier draft added a route so the client could get per-leaf counts. Its own
justification conceded the tree is safe to bundle, and Phase 1's reason for
withholding counts (two writers on one file) dissolved once Phase 2 emits a
separate `src/data/regions/counts.js`.

So: the client imports `src/lib/regions.js`, which imports the two generated
region files and nothing else. No route, no fetch, no loading state, no cache —
and the home page keeps rendering its picker on first paint, as it does today
from `cities` (`page.js:14`).

### `/api/debug/city-coverage`

Accept `?region=`, keep `?city=`. A leaf serves its own boundary and panoramas; a
province serves the union and all of them. Viewport filtering, even sampling, and
boundary-once behaviour unchanged. Rename the directory to `region-coverage` and
update the single caller (`src/app/debug/coverage/page.js:59`).

## Related Code Files

- Modify: `src/app/api/new-game/route.js`
- Modify: `src/app/api/guess/route.js`
- Modify: `src/app/api/leaderboard/route.js`
- Modify: `src/app/api/debug/city-coverage/route.js` → `.../debug/region-coverage/route.js`
- Modify: `src/lib/session.js` — JSDoc only; the store is shape-agnostic
- Modify: `tests/session.test.js` — fixtures use `regionCode` / `pickedRegion`

## Implementation Steps

1. Add a shared `resolvePlayableRegion(searchParams)` helper: read `region`, fall
   back to `city`, uppercase, validate against the tree and `playableRegions()`,
   return the node or a 400-shaped error. Use it in all four routes.
2. Update `/api/new-game` GET: draw, store `pickedRegion` + `regionCode`, return
   the `region` block built from `pickedRegion` only.
3. Update `/api/new-game` POST: return `pickedRegion`, never `regionCode`.
4. Update `/api/guess`: consume the session first, then fan out from
   `session.regionCode ?? session.cityCode`; widen `gameResult` with `levels`.
5. Update `/api/leaderboard`: validated region, 400 on unknown.
6. Rename the coverage route directory; update its one caller.
7. Update `tests/session.test.js` fixtures; add the old-shape-session test.
8. `npm test`, then `npm run build:check`.

## Validation

- `GET /api/new-game?region=TPHCM-Q7` stores `regionCode: 'TPHCM-Q7'`.
- `GET /api/new-game?region=VN` succeeds; the stored `regionCode` is a **leaf**,
  and the response body contains it **nowhere**.
- `POST /api/new-game` with a `VN` session returns no leaf code and no
  `exactLocation`.
- `GET /api/new-game?city=HN` behaves as before.
- `GET /api/new-game?region=NOPE` and `?region=<sub-threshold leaf>` return 400,
  not 500, naming the region.
- A guess against a `VN` session credits three server-chosen levels.
- Posting a mismatched region in the guess body changes nothing about which keys
  move — the anti-cheat property the design rests on.
- A replayed guess after a mid-write failure does not double-credit.
- An old-shape session (`cityCode`, no `regionCode`) still scores at province level.
- `GET /api/leaderboard?region=VN` matches `GET /api/leaderboard`.
- No route imports `src/lib/pano-index.js` into anything a client component reaches.

## Risk Assessment

**A pre-guess response leaks the leaf.** *Signal:* any response body containing
`session.regionCode`. *Response:* the explicit test above runs against both
`/api/new-game` verbs. This is the highest-value test in the phase.

**In-flight sessions break across deploy.** *Signal:* `/api/guess` 500s on
sessions created before the deploy. *Response:* the `?? session.cityCode`
fallback, covered by a test so it survives refactors.

**Consuming the session first loses a guess on a write failure.** *Signal:* a
player reports a scored round that did not count. *Response:* accepted trade —
one lost guess beats six double-credited keys. The 500 is visible to the player.

**Renaming the coverage route breaks the debug page.** *Signal:* 404 on
`/debug/coverage`. *Response:* one caller at `page.js:59`; update in the same
commit. Note that `src/app/debug/coverage/page.js` could not be read during
planning (a context hook denies paths matching `coverage`), so confirm its
contents at implementation time rather than trusting this description.

## Success Criteria

- [ ] All four routes accept region codes at any level
- [ ] `?city=` still works everywhere it works today
- [ ] The session stores both the picked region and the resolved leaf
- [ ] No pre-guess response exposes `regionCode` or `exactLocation`
- [ ] Scoring reads the region from the session, never from the request
- [ ] The session is consumed before the leaderboard writes
- [ ] Unknown or non-playable codes return 400 with a useful message
- [ ] No `/api/regions` route exists; the client imports the generated tree
- [ ] `npm test` and `npm run build:check` pass
