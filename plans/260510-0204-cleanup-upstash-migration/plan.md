---
title: "Cleanup Upstash migration artifacts"
description: "Remove leftover artifacts from the completed Upstash migration: legacy redis npm dep, one-shot migration script, local .env.migrate, and close out the original migration plan's Phase 3."
status: pending
priority: P2
effort: 15m
created: 2026-05-10
related: 260509-2234-upstash-db-migration-with-prefix (closes Phase 3)
blockedBy: []
blocks: []
---

# Cleanup Upstash migration artifacts

## Goal

The Upstash migration is complete and verified in production (15 leaderboard users, 425 sorted-set members migrated, all 4 cities returning panoramas). Old Upstash integration is disconnected from Vercel. This plan retires the migration scaffolding.

## Current state (verified)

| Artifact | State |
|---|---|
| `redis` npm dep | still in `package.json` ^5.8.0 (last needed by migration script) |
| `scripts/migrate-upstash.js` | committed; one-shot job done |
| `.env.migrate` | exists locally (gitignored) with old + new DB credentials |
| `OLD_STORAGE_REDIS_URL` env in Vercel | already removed by user |
| `REDIS_URL` env in Vercel | auto-provisioned by Marketplace integration; unused by app |
| `KV_URL` env in Vercel | auto-provisioned; unused |
| `KV_REST_API_READ_ONLY_TOKEN` env in Vercel | auto-provisioned; unused |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` env in Vercel | **in active use** — keep |
| Mapillary diagnostic logging | already removed (viguessr rewrite replaced it; current logs are kept-on-purpose error observability) |
| Plan `260509-2234-upstash-db-migration-with-prefix` Phase 3 | marked in-progress in tracker; needs close |

## What this plan does

| Action | Reason |
|---|---|
| `npm uninstall redis` | App uses `@upstash/redis` exclusively; node-redis no longer needed |
| Delete `scripts/migrate-upstash.js` | One-shot done; recoverable from git history if ever needed |
| Delete local `.env.migrate` | Contains old DB credentials no longer in use; sensitive even if gitignored |
| Mark migration plan Phase 3 complete | Operational status accuracy |

## What this plan does NOT do

- **Don't touch `REDIS_URL`, `KV_URL`, `KV_REST_API_READ_ONLY_TOKEN`** — they're auto-provisioned by the Vercel Marketplace Upstash integration. Removing them via CLI causes drift; integration may re-sync them. They're harmless when unused.
- Don't change the diagnostic-but-still-useful console.error lines in `src/lib/mapillary.js` — those provide error observability for the Mapillary 500s and aren't temporary instrumentation.

## Phases

| # | Phase | Effort | Status |
|---|---|---|---|
| 01 | [Cleanup](./phase-01-cleanup.md) | 15m | pending |

## Success Criteria

- `npm ls redis` returns nothing
- `scripts/` directory empty (or removed entirely)
- `.env.migrate` not present locally
- `npm run build` passes
- Original migration plan reports Phase 3 completed
