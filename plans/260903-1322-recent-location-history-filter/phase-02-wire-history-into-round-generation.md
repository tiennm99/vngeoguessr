---
title: "Phase 2: Wire history into round generation"
status: completed
phase: 2
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Wire history into round generation

## Overview

Connect Phase 1's two libraries to the round-creation path: `/api/new-game`
identifies the player, feeds their recent ids into the draw as an exclusion
set, records the id that was drawn, and refreshes the cookie. The exclusion has
to degrade to a repeat, never to a visible error.

## Requirements

**Functional**
- [x] `/api/new-game` resolves a player id from the cookie, minting one when
      absent, and sets it on every successful response.
- [x] The player's last 50 ids are excluded from the draw.
- [x] The drawn id is recorded before the response is returned.
- [x] A pool the exclusion would empty falls back to an unfiltered draw.
- [x] A Redis history read or write failure logs and continues; the round is
      still served.

**Non-functional**
- [x] `fetchRegionPanorama`'s existing single-argument callers keep working
      (default parameter).
- [x] No panorama id, coordinate or resolved district is added to any response
      body — the anti-cheat boundary in `docs/features.md` is unchanged.
- [x] The added Redis round-trips are three per round: the route reads the
      history, then `recordPanoId` re-reads and writes. The second read is
      deliberate — reusing the route's copy would stretch the read-modify-write
      window across the whole Mapillary fetch, widening the lost-update race
      the design already accepts.

## Architecture

### `src/lib/mapillary.js`

```js
export async function fetchRegionPanorama(regionCode, recentIds = new Set()) {}
```

The function already keeps a `tried` set to avoid re-drawing a candidate whose
Mapillary lookup failed. `recentIds` is a second, softer set: `tried` must never
be relaxed within a round, while `recentIds` must be dropped rather than allowed
to starve a small region.

As shipped, the soft/hard error split is factored into a `drawCandidate` helper
so the classification is written once and the loop never mutates its counter:

```js
// null pano + a dryMessage means an exhausted pool; anything else still throws
async function drawCandidate(regionCode, excludeIds) {}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  let { pano, dryMessage } = await drawCandidate(
    regionCode, applyRecent ? new Set([...tried, ...recentIds]) : tried);
  if (!pano && applyRecent) {                 // history emptied it, not the index
    console.warn(`Recent-location filter exhausted ${regionCode}; allowing a repeat`);
    applyRecent = false;
    ({ pano, dryMessage } = await drawCandidate(regionCode, tried));
  }
  if (!pano) return { success: false, error: dryMessage };
  // ...unchanged Mapillary lookup and retry logic...
}
```

The redraw happens inside the same attempt. Spending one would quietly cost a
third of the lookup budget in exactly the small regions that need it most. The
`console.warn` is the signal that `HISTORY_LIMIT` is too large for that region.

`pickRandomPano` itself needs no change. Its rejection sampler makes 8 offset
draws before falling back to a `NOT (id = ANY($2::text[]))` filtered query; with
the worst realistic exclusion ratio (50 of 171 rows, ~29%) the chance of all 8
missing is ~6e-5, and the filtered fallback is correct when it happens.

### `src/app/api/new-game/route.js`

```js
const playerId = readPlayerId(request) ?? newPlayerId();
const recent = await recentPanoIdsOrNone(playerId);      // [] on failure
const imageResult = await fetchRegionPanorama(pickedRegion, new Set(recent));
// ...existing validation, session store, logging...
await recordPanoOrIgnore(playerId, selectedImage.id);    // swallow failure
const response = NextResponse.json({ ...unchanged... });
response.cookies.set(PLAYER_COOKIE, playerId, playerCookieOptions());
return response;
```

Both history calls are wrapped so Redis trouble cannot cost a player their
round: the history is a convenience, while the session write immediately above
it is load-bearing and must keep throwing. Keep the two wrappers as small named
helpers in the route file rather than pushing `try/catch` into
`pano-history.js`, so the library still reports failures to any future caller
that does care.

The cookie is set only on the success path. An error response carries no id; the
next successful round mints one. Adding it to every branch would spread cookie
handling across five returns for no behavioural gain.

The response body is untouched. `POST /api/new-game` (session debug lookup) is
untouched.

## Related Code Files

- Modify: `src/lib/mapillary.js` — new `recentIds` parameter, soft-exclusion
  fallback
- Modify: `src/app/api/new-game/route.js` — identity, exclusion, recording,
  cookie
- Modify: `tests/mapillary.test.js` — exclusion and fallback coverage
- Modify: `tests/new-game-route.test.js` — cookie and history coverage
- Create: `tests/new-game-history-failure.test.js` — the round survives an
  unavailable history store. Its own file because `vi.mock` replaces an ES
  module for the whole file; it cannot be swapped back mid-suite
- Unchanged: `src/lib/pano-index.js`, `src/app/api/guess/route.js`,
  `src/app/api/skip/route.js`, every client component

## Implementation Steps

1. Add the `recentIds` parameter and the soft-exclusion loop to
   `fetchRegionPanorama`. Preserve the existing rule that only a
   `No panoramas left` message is soft — infrastructure errors still rethrow.
2. Wire `/api/new-game`: read/mint the id, read history, pass the set, record
   the drawn id, set the cookie on the success response.
3. Extend `tests/mapillary.test.js`:
   - ids in `recentIds` are not returned when alternatives exist
   - a pool consisting only of excluded ids still returns a panorama, with the
     downgrade warning logged
   - a genuinely empty pool still returns `success: false`
   - an infrastructure error still propagates (regression guard)
4. Extend `tests/new-game-route.test.js`:
   - no cookie on the request → response `Set-Cookie` contains `vng_pid`,
     `HttpOnly`, `SameSite=Lax`
   - a valid `Cookie: vng_pid=<id>` → the same id is echoed back, not replaced
   - after a round, `getRecentPanoIds(<id>)` contains the session's `imageId`
   - two successive rounds in a two-panorama region return different ids
   - a garbage cookie value is ignored and a fresh id issued
   - the response body still exposes neither `regionCode` nor coordinates
     (existing assertions must keep passing)
5. Run the focused route and lib tests, then the full suite.

## Success Criteria

- [x] `npx vitest run tests/mapillary.test.js tests/new-game-route.test.js` green.
- [x] `npm test` green with no pre-existing test modified to accommodate the
      change (additions only).
- [x] Two consecutive rounds in a small district never repeat while alternatives
      exist, and never error once they run out.

## Risk Assessment

| Risk | Signal | Response |
|---|---|---|
| History exclusion starves a small or thin region | `console.warn` downgrade lines for a specific region in production logs | Lower `HISTORY_LIMIT`, or scale the applied exclusion to the region's pano count (e.g. `min(50, floor(panos / 4))`) |
| The extra Redis read adds latency to round creation | Round-create timing regresses noticeably | Both calls are single REST round-trips against the Upstash instance already used for the session write; if it matters, issue the history read concurrently with `fetchRegionPanorama` rather than before it |
| A client with cookies disabled gets a new id every round | History never accumulates for that player | Accepted: behaviour is exactly today's — no repeat filtering, no error |
| `NextResponse.cookies.set` behaves differently under the pinned Next version | The route test finds no `Set-Cookie` header | Fall back to `response.headers.append('Set-Cookie', ...)` built from `playerCookieOptions()`; the test asserts the header, not the API |
