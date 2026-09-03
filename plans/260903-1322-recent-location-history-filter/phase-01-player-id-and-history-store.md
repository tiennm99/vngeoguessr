---
title: "Phase 1: Player id and history store"
status: completed
phase: 1
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Player id and history store

## Overview

Add the two server-only libraries this feature rests on: an anonymous
per-browser player id carried in a cookie, and a capped, expiring list of the
panorama ids that player has been shown. Neither is wired into a route yet — at
the end of this phase both are fully unit-tested in isolation.

## Requirements

**Functional**
- [x] Read an existing player id from a request's `Cookie` header, returning
      `null` when absent or malformed.
- [x] Mint a new id (`crypto.randomUUID()`) when there is none.
- [x] Produce the cookie attributes for setting it on a response.
- [x] Read a player's recent panorama ids, newest first, `[]` when unknown.
- [x] Record an id: prepend, de-duplicate, cap at 50, refresh the 3-day TTL.

**Non-functional**
- [x] Both modules are server-only and touch no browser globals.
- [x] The history module uses only the existing `upstash.js` primitives —
      no new Redis value types, no changes to `tests/fake-upstash-redis.js`.
- [x] Individual function parameters, JSDoc on every export, matching the
      house comment style (explain *why*, not *what*).

## Architecture

### `src/lib/player-id.js`

Cookie plumbing only; imports nothing from Redis.

```js
export const PLAYER_COOKIE = 'vng_pid';
export const PLAYER_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, rolling

export function readPlayerId(request) {}   // Request -> string | null
export function newPlayerId() {}           // -> uuid
export function playerCookieOptions() {}   // -> { httpOnly, sameSite, path, maxAge, secure }
```

`readPlayerId` parses `request.headers.get('cookie')` by hand rather than using
`NextRequest.cookies` or `next/headers`. The reason is testability and
consistency: every route test in `tests/` drives the handler with a plain
`new Request(...)`, which has no `.cookies`. Header parsing works against both
the plain `Request` in tests and the `NextRequest` Next actually passes, and it
keeps the module free of framework-version-specific imports.

The parsed value is validated against a UUID shape before being returned. It
becomes a Redis key segment, so an attacker-supplied cookie must not be able to
smuggle a glob, a colon or unbounded length into the keyspace.

`playerCookieOptions` returns `httpOnly: true` (the client never needs to read
it), `sameSite: 'lax'`, `path: '/'`, and `secure` only when
`process.env.NODE_ENV === 'production'` so local HTTP dev and Playwright still
receive it. The cookie's max age is longer than the history TTL on purpose: the
id is refreshed on every round, so an active player keeps a stable id while
their *data* still ages out after three days of inactivity.

### `src/lib/pano-history.js`

```js
export const HISTORY_LIMIT = 50;
export const HISTORY_TTL = 3 * 24 * 60 * 60; // 3 days

export async function getRecentPanoIds(playerId) {}        // -> string[]
export async function recordPanoId(playerId, panoId) {}    // -> void
```

Key: `history:{playerId}` (logical; `upstash.js` prepends `KEY_PREFIX`).
Value: a JSON array of panorama id strings, newest first, read and written with
the existing `getJson` / `putJson`.

`recordPanoId` filters the incoming id out of the stored array before
prepending, so a repeat that slipped through the fallback path moves to the
front rather than occupying two of the fifty slots. It then `slice(0, 50)`s and
writes with the TTL, which makes the expiry roll forward on every round.

Read-modify-write is deliberately not atomic — see the plan's design table.

## Related Code Files

- Create: `src/lib/player-id.js`
- Create: `src/lib/pano-history.js`
- Create: `tests/player-id.test.js`
- Create: `tests/pano-history.test.js`
- Modify: `src/lib/upstash.js` — add `history:{playerId}  string, TTL 3 days`
  to the logical key namespace comment at the top. No code change.

## Implementation Steps

1. Write `src/lib/player-id.js`. Cookie header parsing splits on `;`, trims,
   splits each pair on the first `=` only, and matches the name exactly.
2. Write `src/lib/pano-history.js` on top of `getUpstash`/`getJson`/`putJson`.
   Guard a missing or non-array stored value back to `[]` so a corrupt key
   degrades to "no history" rather than throwing.
3. Extend the key-namespace comment block in `src/lib/upstash.js`.
4. Write `tests/player-id.test.js`:
   - no `Cookie` header → `null`
   - header with other cookies only → `null`
   - `vng_pid` among several cookies → the id
   - malformed / non-UUID / over-long value → `null`
   - a value that is a prefix or suffix of the name is not matched
   - `newPlayerId()` returns distinct UUID-shaped values
   - `playerCookieOptions()` is httpOnly + lax; `secure` follows `NODE_ENV`
5. Write `tests/pano-history.test.js` (mock Upstash exactly as
   `tests/session.test.js` does, with `resetStore()` between tests):
   - unknown player → `[]`
   - one record → `[id]`
   - 60 records → length 50, newest first, oldest dropped
   - re-recording an existing id keeps length stable and moves it to the front
   - the key's TTL is ~3 days and is refreshed by a later write
   - two player ids do not see each other's history

## Success Criteria

- [x] `npx vitest run tests/player-id.test.js tests/pano-history.test.js` green.
- [x] `npm test` still green (no regression from the `upstash.js` comment edit).
- [x] `npm run lint` clean.
- [x] Neither new module imports anything from `src/app/` or touches `window`.

## Risk Assessment

| Risk | Signal | Response |
|---|---|---|
| A JSON-array history grows large enough to matter in Redis | A 50-element array of ~22-char ids is ~1.3 KB; a player at 1 KB+ is expected, not a problem | None needed; revisit only if key size shows up in Upstash metrics |
| Concurrent rounds from one player drop a history entry | Not observable in practice | Accepted (design table). If repeats are ever reported despite the filter, move to `LPUSH`/`LTRIM` and add the four primitives to `upstash.js` + the fake |
| Cookie shape rejected by a browser or proxy | `Set-Cookie` absent in the Phase 2 route test | Attributes are plain and standard; drop `secure` if it breaks a non-HTTPS deployment |
