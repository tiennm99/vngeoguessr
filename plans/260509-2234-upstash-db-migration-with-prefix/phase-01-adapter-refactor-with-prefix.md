---
phase: 1
title: "Adapter Refactor with Prefix"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Adapter Refactor with Prefix

## Overview

Replace the node-redis client (`src/lib/redis.js`) with an `@upstash/redis` REST adapter that bundles client + `KEY_PREFIX` into a single handle. Refactor `session.js` and `leaderboard.js` to call helpers that prepend the prefix, mirroring the store-scraper-bot adapter pattern. After this phase, the runtime targets the new Upstash DB and is multi-tenant safe.

## Requirements

- Public API of `session.js` and `leaderboard.js` (function names + arg shapes) **must not change**. API routes must not be modified beyond import paths.
- All physical Redis keys carry `KEY_PREFIX` (default `vngeoguessr:`). Logical keys at call sites stay raw (`session:abc`, `leaderboard:vietnam`, etc.).
- Prefix applied centrally in the adapter — no caller may concatenate the prefix manually.
- Env var naming: accept both `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` and the Vercel Marketplace aliases `KV_REST_API_URL`/`KV_REST_API_TOKEN`. Throw on first call if neither set.
- Sorted-set ordering semantics preserved: scores leaderboard returns highest-first; distance leaderboard returns lowest-first.
- TTL semantics preserved on session keys (30 min via `ex`).
- Followed: JavaScript only, individual parameters (no destructuring in public function signatures).

## Architecture

```
src/lib/
├── upstash.js        ← NEW: createUpstashClient + getJson/putJson/del
│                       + zAdd/zRange/zScore/zRank/zRevRank/zRemRangeByRank
├── redis.js          ← DELETE
├── session.js        ← imports getUpstash() handle; uses putJson/getJson/del
└── leaderboard.js    ← imports getUpstash() handle; uses sorted-set helpers
```

### Adapter shape

```js
// src/lib/upstash.js
import { Redis } from '@upstash/redis';

const DEFAULT_KEY_PREFIX = 'vngeoguessr:';

let handle = null;

export function getUpstash() {
  if (handle) return handle;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url) throw new Error('UPSTASH_REDIS_REST_URL or KV_REST_API_URL is required');
  if (!token) throw new Error('UPSTASH_REDIS_REST_TOKEN or KV_REST_API_TOKEN is required');
  const client = new Redis({ url, token });
  const prefix = process.env.KEY_PREFIX ?? DEFAULT_KEY_PREFIX;
  handle = { client, prefix };
  return handle;
}

function pkey(h, key) { return `${h.prefix}${key}`; }
```

### Helper inventory (all accept handle as first arg)

| Helper | Wraps | Caller |
|---|---|---|
| `getJson(h, key)` | `client.get` (auto-parses) | session read |
| `putJson(h, key, value, ttlSeconds)` | `client.set(..., { ex })` | session write |
| `del(h, key)` | `client.del` | session delete |
| `zAdd(h, key, score, member)` | `client.zadd(key, { score, member })` | leaderboard write |
| `zScore(h, key, member)` | `client.zscore` | leaderboard read |
| `zRangeWithScores(h, key, start, stop, rev)` | `client.zrange(..., { withScores, rev })` | leaderboard read |
| `zRank(h, key, member)` | `client.zrank` | distance rank |
| `zRevRank(h, key, member)` | `client.zrevrank` | score rank |
| `zRemRangeByRank(h, key, start, stop)` | `client.zremrangebyrank` | leaderboard trim |

`@upstash/redis` returns `zrange` with scores as a flat `[member, score, member, score, ...]` array — helper must reshape to `[{ value, score }, ...]` to match what `leaderboard.js` consumes today.

### Caller migration (mechanical)

Each `await getRedis()` becomes `getUpstash()`. Each `redis.method(physicalKey, ...)` becomes `helper(handle, logicalKey, ...)`. Examples:

| Before | After |
|---|---|
| `redis.setEx('session:' + id, 1800, JSON.stringify(data))` | `await putJson(h, 'session:' + id, data, 1800)` |
| `redis.get('session:' + id)` then `JSON.parse` | `await getJson(h, 'session:' + id)` |
| `redis.zAdd(key, { score, value })` | `await zAdd(h, key, score, value)` |
| `redis.zRangeWithScores(key, 0, n-1, { REV: true })` | `await zRangeWithScores(h, key, 0, n-1, true)` |
| `redis.zRemRangeByRank(key, 0, -201)` | `await zRemRangeByRank(h, key, 0, -201)` |

Note: `session.js` currently `JSON.stringify`s the value before `setEx` and `JSON.parse`s after `get`. The new helpers do this internally; remove the manual stringify/parse at call sites.

## Related Code Files

- Create: `src/lib/upstash.js`
- Modify: `src/lib/session.js` (swap to handle + helpers, drop manual JSON marshal)
- Modify: `src/lib/leaderboard.js` (swap to handle + sorted-set helpers; reshape `zrange` results)
- Delete: `src/lib/redis.js`
- Modify: `package.json` — add `@upstash/redis`, remove `redis`. **Highlight to user for manual install** per project's `File Modification Policy` (configuration changes).

## Implementation Steps

1. Add `@upstash/redis` dep, drop `redis` dep.
   - User runs: `npm install @upstash/redis && npm uninstall redis`
   - Agent must NOT auto-modify `package.json` per project rules; flag the install command in the final report.
2. Write `src/lib/upstash.js` with the singleton `getUpstash()` and all helpers listed above. Verify the `zRangeWithScores` reshape matches what `leaderboard.js` expects (`[{ value, score }]`).
3. Rewrite `src/lib/session.js` to use `getUpstash()` + `putJson`/`getJson`/`del`. Keep function signatures identical (`storeGameSession(sessionId, sessionData)`, etc.).
4. Rewrite `src/lib/leaderboard.js` to use `getUpstash()` + sorted-set helpers. Keep `getLeaderboard(cityCode, limit, type)`, `submitScore(username, score, cityCode)`, `submitDistanceRecord(username, distance, cityCode)` signatures intact.
5. Delete `src/lib/redis.js`.
6. Run `npm run lint` and `npm run build` — no compile errors, no `from 'redis'` references remain.
7. Local sanity (user-driven, optional): `npm run dev`, hit `/api/leaderboard` (GET) — should return empty leaderboard from new DB without throwing.

## Success Criteria

- [ ] `src/lib/upstash.js` exports `getUpstash` + the helper inventory above
- [ ] `getUpstash()` reads `KEY_PREFIX` (default `vngeoguessr:`) and accepts both env-var naming conventions
- [ ] `src/lib/session.js` and `src/lib/leaderboard.js` import only from `./upstash.js`
- [ ] `src/lib/redis.js` deleted; `grep -r "from './redis" src/` empty
- [ ] `grep -r "REDIS_URL\|node:redis\|from 'redis'" src/` empty
- [ ] `npm run build` passes
- [ ] API route files (`api/guess/route.js`, `api/cron/route.js`, `api/leaderboard/route.js`) untouched

## Risk Assessment

- **Risk:** `@upstash/redis` `zrange` shape with `withScores: true` differs from `node-redis` `zRangeWithScores`. **Mitigation:** Helper normalizes to `[{ value, score }]`; verify with one log line during dev smoke before proceeding to Phase 2.
- **Risk:** `@upstash/redis` auto-parses JSON only when value was set as an object via the SDK. Mixing manual `JSON.stringify` with later `client.get` may double-encode. **Mitigation:** centralize encode/decode in `putJson`/`getJson` — pass raw objects in, receive raw objects out. No caller does its own marshal.
- **Risk:** Caller forgets to `await getUpstash()` — but it's synchronous (no connection step in REST SDK). **Mitigation:** helper is sync; no chance of unawaited promise here.
- **Risk:** Hardcoded prefix drift between adapter and migration script (Phase 2). **Mitigation:** both read `process.env.KEY_PREFIX ?? 'vngeoguessr:'`. Document the contract in `plan.md`.
- **Risk:** `next build` triggers env-var lookup on import — `getUpstash()` must be lazy. **Mitigation:** call from request handlers, not module top-level. Pattern matches existing `getRedis()`.

## Out of Scope

- Migrating data from old DB → new DB (Phase 2).
- Removing old DB env vars from Vercel (Phase 3, user-driven).
- Updating `docs/tech-stack.md` (Phase 3).
