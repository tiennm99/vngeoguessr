---
phase: 2
title: "Data Migration old → new Upstash"
status: pending
priority: P1
effort: "30 min"
dependencies: [1]
---

# Phase 2: Data Migration old → new Upstash

## Overview

One-shot script that copies leaderboard sorted-set data from the OLD Upstash DB to the NEW Upstash DB, prepending `KEY_PREFIX` (default `vngeoguessr:`) on write. Sessions are not migrated — they are 30-min ephemeral and any in-flight games will resubmit cleanly post-cutover. The OLD DB is read-only during this phase.

## Requirements

- Migrate exactly these logical keys (sorted sets):
  - `leaderboard:vietnam`
  - `leaderboard:city:hanoi`, `leaderboard:city:danang`, `leaderboard:city:hcm`, `leaderboard:city:dalat`, `leaderboard:city:duchoa` (and any other city codes present)
  - `distance:vietnam`
  - `distance:city:*` (same set of city codes)
- Discover keys via `SCAN MATCH 'leaderboard:*'` and `SCAN MATCH 'distance:*'` against the OLD DB rather than hardcoding city codes — script stays correct if a city is added later.
- Write to NEW DB with prefix prepended: `vngeoguessr:leaderboard:vietnam` etc.
- Idempotent: re-runs produce the same final state. Use `DEL <prefix>+key` on the destination before re-populating, or rely on `ZADD` overwriting score-by-member (safe).
- `--dry-run` flag: log counts and sample keys, no writes.
- Log effective `KEY_PREFIX` and per-key cardinality so operator can verify alignment with runtime.

## Architecture

```
scripts/migrate-upstash.js   ← NEW
  Reads:  OLD_UPSTASH_REDIS_REST_URL / OLD_UPSTASH_REDIS_REST_TOKEN
  Writes: UPSTASH_REDIS_REST_URL    / UPSTASH_REDIS_REST_TOKEN  (NEW DB, same as runtime)
  PREFIX = process.env.KEY_PREFIX ?? 'vngeoguessr:'

  steps:
  1. SCAN old DB for keys matching 'leaderboard:*' and 'distance:*'
  2. For each key:
       members = oldClient.zrange(key, 0, -1, { withScores: true })
       newClient.zadd(PREFIX + key, ...members)  // multi-add
  3. Log: { source_keys: N, total_members: M, prefix: 'vngeoguessr:' }
  4. Print sample physical keys written so operator can spot-check the dashboard
```

Single Node.js file, no test framework needed. Run with `node --env-file=.env.migrate scripts/migrate-upstash.js`.

### Source/destination protocols (confirmed via `vercel env ls`)

- OLD DB → TCP only, env var `OLD_STORAGE_REDIS_URL` → script uses `redis` (node-redis)
- NEW DB → REST + TCP; env vars `KV_REST_API_URL` + `KV_REST_API_TOKEN` → script uses `@upstash/redis`

### `.env.migrate` shape (gitignored; populated via `vercel env pull .env.migrate`)

```
OLD_STORAGE_REDIS_URL=redis://...        # OLD DB (source, TCP)
KV_REST_API_URL=https://...              # NEW DB (dest, REST)
KV_REST_API_TOKEN=...
KEY_PREFIX=vngeoguessr:                  # optional, defaults to vngeoguessr:
```

## Related Code Files

- Create: `scripts/migrate-upstash.js`
- Modify: `.gitignore` — ensure `.env.migrate` is ignored. **Highlight to user** if `.gitignore` already covers `.env*`.
- No `package.json` script entry needed (one-shot; user invokes directly).

## Implementation Steps

1. Write `scripts/migrate-upstash.js`:
   - Two `Redis` instances (`oldClient`, `newClient`) using `@upstash/redis`.
   - `parseArgs` for `--dry-run`.
   - `scanAll(client, match)` helper that paginates `client.scan(cursor, { match, count: 200 })` until cursor returns `0`.
   - For each key: `members = await oldClient.zrange(key, 0, -1, { withScores: true })`. The SDK returns `[member, score, member, score, ...]`; reshape into the form `zadd` accepts.
   - Multi-add: `newClient.zadd(physicalKey, ...members.map(m => ({ score: m.score, member: m.value })))`.
   - Skip empty sets.
   - In `--dry-run` mode, do not call `zadd`; print what would be written.
2. Verify `.env.migrate` is gitignored (`grep -F '.env' .gitignore`). If not covered, append `.env.migrate` to `.gitignore` and flag for user.
3. Local run: `node --env-file=.env.migrate scripts/migrate-upstash.js --dry-run`. Verify counts match expected (compare to old DB Upstash dashboard).
4. Real run: `node --env-file=.env.migrate scripts/migrate-upstash.js`. Verify NEW DB dashboard shows prefixed keys with matching cardinality.
5. Read-back compare: pick one user from `leaderboard:vietnam`, confirm same score in NEW DB (`vngeoguessr:leaderboard:vietnam`).

## Success Criteria

- [ ] `scripts/migrate-upstash.js` exists; runs cleanly with `--dry-run` and without
- [ ] Effective `KEY_PREFIX` printed at start of run (operator-visible alignment check)
- [ ] All `leaderboard:*` and `distance:*` source keys discovered via SCAN (no hardcoded city list)
- [ ] Per-key member count in NEW DB equals OLD DB
- [ ] Physical keys in NEW DB visibly carry the `vngeoguessr:` prefix
- [ ] Re-run is idempotent: `ZCARD` values unchanged on second run
- [ ] `.env.migrate` is gitignored; not committed

## Risk Assessment

- **Risk:** Old DB is the node-redis-protocol flavor and has no REST creds. **Mitigation:** if OLD DB lacks REST endpoint, use `redis` npm package (still installed pre-Phase 1 cleanup) for the read side, REST SDK for write side. Confirm during user data-collection step before writing the script.
- **Risk:** `zrange` cursor / `withScores` SDK shape mismatch. **Mitigation:** log first key's payload before the loop; abort on shape mismatch with a clear error.
- **Risk:** Race — players keep submitting to OLD DB while migration runs (writes get lost in NEW DB). **Mitigation:** Phase 3 cutover swaps env vars in one Vercel redeploy; migration runs at low-traffic time. Acceptable: at most a handful of new entries lost; users can re-play.
- **Risk:** Prefix drift between script and runtime (script uses `vngeoguessr:`, runtime uses `vngeoguessr-prod:` etc.). **Mitigation:** script logs prefix; Phase 3 success criteria includes `/api/leaderboard` returning a non-empty list post-cutover (end-to-end alignment check).
- **Risk:** Sessions in flight at cutover see stale state. **Mitigation:** sessions are 30-min TTL and not migrated; affected players just resubmit. Documented expectation, not a defect.

## Out of Scope

- Migrating `session:*` keys (intentionally skipped — ephemeral).
- Updating Vercel env vars or removing the OLD DB integration (Phase 3, user-driven).
