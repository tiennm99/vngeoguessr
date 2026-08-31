---
title: "Panorama index to Neon Postgres, Next 16, Playwright E2E"
date: 2026-08-31
summary: "Moved the 28MB pano index from bundled JSON to Neon, upgraded to Next 16, added an offline Playwright lane; all review findings fixed"
---

# Panorama index to Neon Postgres, Next 16, Playwright E2E

## What happened

- Migrated the panorama index out of the repo: `src/data/panos/` (28MB JSON,
  bundled into every serverless instance) deleted; rows now live in Neon
  Postgres (`panoramas`, `pano_provinces`), read via `src/lib/pano-db.js`
  (`@neondatabase/serverless` HTTP driver). `src/lib/pano-index.js` rewritten
  as async SQL: process-cached COUNT + `ORDER BY id OFFSET` random draw with
  rejection sampling for excluded ids; SQL-side striped sampling for the debug
  coverage route.
- Pipeline now writes gitignored `data-build/panos/` artifacts;
  `scripts/seed-pano-db.mjs` validates them (the data-quality invariants that
  used to be vitest assertions against committed JSON, extracted to
  `scripts/lib/pano-artifacts.mjs`), uploads to `panoramas_next` in unnest
  batches, verifies row counts, then renames into place in one transaction,
  keeping `panoramas_old` as a one-generation backup. Seeded 424,617 rows.
- Tests: PGlite (real Postgres in-process) mocked in at the Neon SDK boundary,
  mirroring the fake-upstash pattern. Suite went 274 tests/15.5s to 234/3s.
- Upgrades: Next 15.5→16.3.3 (eslint config rewritten to native flat config;
  `react-hooks/set-state-in-effect` and `react-hooks/refs` deliberately
  downgraded to warn — hydration and imperative-map patterns), React 19.2.8,
  lucide-react 1.x, turf 7.4, upstash 1.38.3; `uuid` package replaced by
  `crypto.randomUUID()`. ESLint stayed on ^9: eslint 10 breaks
  eslint-config-next (`scopeManager.addGlobals is not a function`).
- New Playwright lane: 9 specs (home picker, username modal, full round to the
  reveal) with every `/api/*` call, the panorama image, and OSM tiles stubbed
  at the browser boundary — runs offline with no env.

## Decision

- Neon over Supabase: Supabase free pauses after 1 week idle and needs manual
  resume; Neon scale-to-zero auto-wakes (~1s), fits a sporadically-played game.
- Data-quality gate moved to seed time because CI can no longer see the real
  artifacts; behavioral tests run on fixtures.
- Code review surfaced 3 major findings, all fixed: pickRandomPano DB failures
  were masked as "no Mapillary coverage" (now rethrown, only "No panoramas
  left" is soft); the draw query had no supporting index (added composite
  (province,id)/(district,id), reseeded); the table swap left a
  no-`panoramas`-relation window (now `sql.transaction`).

## Next steps

- User: set DATABASE_URL in Vercel project env (marketplace injects it),
  deploy, verify a real round; the debug coverage route now costs metered Neon
  compute per call — unauthenticated, previously accepted as bundled-JSON
  exposure, may deserve a rate limit or auth later.
- Commit pending user go-ahead; config files touched: package.json,
  package-lock.json, .gitignore, vitest*.config.mjs, eslint.config.mjs,
  playwright.config.mjs (new), CLAUDE.md (Next 16 injected an agent-rules
  block).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
