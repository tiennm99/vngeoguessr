---
title: "Migrate Upstash DB with Project Key Prefix"
description: "Switch vngeoguessr from node-redis pointed at the old Upstash DB to @upstash/redis REST SDK pointed at the new Vercel-Marketplace Upstash DB. Introduce KEY_PREFIX adapter pattern (default vngeoguessr:) so the new DB can be safely shared with other Vercel projects (mirrors store-scraper-bot)."
status: pending
priority: P1
effort: 2h
branch: main
tags: [vercel, upstash, migration, redis, multi-tenant]
created: 2026-05-09
blockedBy: []
blocks: []
---

# Migrate Upstash DB with Project Key Prefix

## Goal

Cut vngeoguessr over from old Upstash DB → new Upstash DB while introducing a project-scoped key prefix. After this plan, the same Upstash DB can host data for multiple Vercel projects without key collisions.

## Current State

- Connection: `src/lib/redis.js` uses `redis@5.8.0` (TCP) via `process.env.REDIS_URL` — a single global client.
- Both old and new Upstash DBs are already linked to the Vercel project (per user); env vars exist for both. New DB connection must come via the Vercel Marketplace Upstash integration (`KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
- Logical key namespaces in use:
  - `session:{sessionId}` — string, TTL 30 min (`src/lib/session.js`)
  - `leaderboard:vietnam`, `leaderboard:city:{cityCode}` — sorted sets (`src/lib/leaderboard.js`)
  - `distance:vietnam`, `distance:city:{cityCode}` — sorted sets (`src/lib/leaderboard.js`)
- Files touching Redis: `src/lib/redis.js`, `src/lib/session.js`, `src/lib/leaderboard.js`, `src/app/api/guess/route.js`, `src/app/api/cron/route.js`, `src/app/api/leaderboard/route.js`.

## Target State

- Connection: `@upstash/redis` REST SDK; client + prefix bundled in a single handle returned by `createUpstashClient(env)`.
- Default `KEY_PREFIX = 'vngeoguessr:'`. All physical keys carry it; logical keys at call sites stay unchanged.
- No `process.env.REDIS_URL` references remain. `redis` npm dep removed.
- One-shot migration script copies sorted-set leaderboard data from old DB → new DB, prepending the prefix on write. Sessions are not migrated (30-min TTL, ephemeral).

## Key Decisions

- **REST SDK over node-redis.** Vercel Marketplace Upstash exposes REST creds; `@upstash/redis` is fluid-compute friendly (no socket pooling), matches the store-scraper-bot reference. Sorted-set commands (`zadd`, `zrange`, `zscore`, `zrank`, `zrevrank`, `zremrangebyrank`) are all supported.
- **Adapter shape mirrors store-scraper-bot.** `createUpstashClient(env) → { client, prefix }`. Helper functions accept the handle and prepend the prefix. Repositories stay prefix-unaware. Difference vs store-scraper-bot: we expose sorted-set helpers (`zAdd`, `zRange`, `zScore`, `zRank`, `zRevRank`, `zRemRangeByRank`) in addition to JSON `get/set/del`.
- **Env var naming.** Adapter accepts both `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Vercel Marketplace alias) — same as store-scraper-bot.
- **Migration scope.** Copy leaderboard sorted sets only. Sessions are not migrated. Old DB stays online briefly as fallback during cutover, then gets disconnected from Vercel by the user.
- **Prefix value.** `vngeoguessr:`. Single source of truth; only override if explicitly multi-tenant beyond this project.

## Phases

| # | Phase | Effort | Status |
|---|---|---|---|
| 01 | [Adapter Refactor with Prefix](./phase-01-adapter-refactor-with-prefix.md) | 1h | pending |
| 02 | [Data Migration old → new Upstash](./phase-02-data-migration.md) | 30 min | pending |
| 03 | [Cutover and Cleanup](./phase-03-cutover-and-cleanup.md) | 30 min | pending |

## Success Criteria (overall)

- App reads/writes against the new Upstash DB via REST SDK.
- All physical keys in new DB carry the `vngeoguessr:` prefix.
- Leaderboard counts (per sorted set, per city) match between old and new DB after migration.
- `npm ls redis` returns nothing; `package.json` lists `@upstash/redis` instead.
- `grep -r "REDIS_URL\|node:redis\|from 'redis'" src/` returns zero hits.
- Production smoke: submit a guess, view leaderboard → both succeed against the new DB.

## Manual Steps Required (User)

These cannot be performed by the agent and must be done by the user:
- Confirm the new Upstash DB env vars present in Vercel project (preview + production).
- Set `KEY_PREFIX=vngeoguessr:` in Vercel env (preview + production). Optional but recommended to make the prefix explicit; default also works.
- Provide the OLD DB REST URL+token to a local `.env.migrate` (read-only, for one-shot migration script).
- After cutover validated, disconnect the old Upstash DB from the Vercel project.

## Dependencies

- `@upstash/redis` npm package (added in Phase 1).
- New Upstash DB already linked via Vercel Marketplace (per user — confirmed pre-plan).
