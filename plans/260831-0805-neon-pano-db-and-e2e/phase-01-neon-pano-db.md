# Phase 1 — Pano index on Neon Postgres

## Context

`src/lib/pano-index.js` imports 28MB of JSON via `src/data/panos/index.js`.
Consumers: `src/lib/mapillary.js` (`pickRandomPano`), the debug coverage route
(`getRegionPanos`, `countPanos`, `getProvinceIndex.generatedAt`), tests.
Playability/counts for the UI come from committed `src/data/regions/counts.js`
(client-safe, stays as-is).

## Schema (created idempotently by the seed script)

```sql
CREATE TABLE IF NOT EXISTS panoramas (
  id       text PRIMARY KEY,
  province text NOT NULL,
  district text,               -- NULL = outside every district polygon
  lat      double precision NOT NULL,
  lng      double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS panoramas_province_idx ON panoramas(province);
CREATE INDEX IF NOT EXISTS panoramas_district_idx ON panoramas(district);

CREATE TABLE IF NOT EXISTS pano_provinces (
  code         text PRIMARY KEY,
  count        integer NOT NULL,
  generated_at timestamptz,
  assigned_at  timestamptz
);
```

Rows sorted by lat at seed time is NOT guaranteed by SQL; even sampling for the
coverage page uses `row_number() OVER (ORDER BY lat)` instead.

## Files

New:
- `src/lib/pano-db.js` — server-only adapter. `getPanoDb()` singleton from
  `DATABASE_URL` (`neon(url)`); exposes `query(h, text, params)`. Mock boundary
  for tests is `@neondatabase/serverless`.
- `scripts/seed-pano-db.mjs` — reads `data-build/panos/*.json`, runs the QA
  invariants that today live in `tests/pano-index.test.js` against real data
  (`unassigned === 0`, `worstStrandedKm < 1.1`, districts ⊆ tree, leaves sum to
  province, ids unique, no malformed rows), refuses to seed on failure. Seeds
  `panoramas_next` in batched `unnest` inserts (~5k rows/request), verifies
  counts vs artifacts and vs committed `counts.js` (warn on drift), then swaps:
  `panoramas` → `panoramas_old`, `panoramas_next` → `panoramas` in one
  transaction. `--province=X` incremental mode: DELETE + insert per province on
  the live table. Requires `DATABASE_URL`.
- `tests/mock-neon.js` + `tests/fake-neon.js` — vi.mock factory returning a
  `neon()` backed by `@electric-sql/pglite` (real Postgres in-process).
- `tests/pano-fixtures.js` — small synthetic dataset using real region codes
  (LD/DL, DN + districts, TPHCM) seeded into PGlite per test file.

Changed:
- `src/lib/pano-index.js` — same module, DB-backed and async:
  - `pickRandomPano(code, excludeIds)` — country: uniform over playable
    provinces (from `regions.js`/counts, no DB); province/district: cached
    `COUNT(*)` + `OFFSET floor(random()*count) LIMIT 1`; excluded id → redraw
    (≤8), then fallback `WHERE id != ALL($ids)` filtered draw; throws
    `No panoramas left to try` when exhausted. Returns `{id, lat, lng,
    regionCode}` with regionCode = district when assigned, else province.
  - `countPanos(code)` — async, process-cached COUNT.
  - `getRegionPanoSample(code, bbox, limit)` — replaces `getRegionPanos` for
    the coverage route: bbox filter + `row_number() % stride` sampling in SQL;
    returns `{panos, total, inView}`.
  - `indexedProvinces()` — async, from `pano_provinces`.
  - `getProvinceMeta(code)` — `generated_at` for the coverage route.
  - `getProvinceIndex`/`getRegionPanos` removed (no in-memory index exists).
- `src/lib/mapillary.js` — `await pickRandomPano(...)`.
- `src/app/api/debug/region-coverage/route.js` — use `getRegionPanoSample` +
  `getProvinceMeta`; response shape unchanged.
- `scripts/lib/paths.mjs` — `PANO_DIR` → `data-build/panos`.
- `scripts/build-pano-index.mjs` — stop writing the pano barrel (keep JSON
  artifact writes). `scripts/assign-pano-districts.mjs` still writes
  `src/data/regions/counts.js` (committed).
- Guard tests: `tests/regions.test.js`, `tests/geo-search.test.js` FORBIDDEN
  lists gain `pano-db`.
- Test rework: `pano-index.test.js` (behavioral tests on fixtures; data-quality
  moved to seed script), `mapillary.test.js`, `region-coverage-route.test.js`,
  `new-game-route.test.js`, `guess-route.test.js`, `barrel.test.js` (drop pano
  half), each mocking `@neondatabase/serverless` like they mock
  `@upstash/redis`.
- `vitest.config.mjs` — add fake `DATABASE_URL` env (config file, highlight).
- `package.json` — deps `@neondatabase/serverless`; devDeps
  `@electric-sql/pglite`; script `data:seed` (config file, highlight).
- `.gitignore` — `data-build/` (config file, highlight).
- Delete from repo: `src/data/panos/*.json`, `src/data/panos/index.js`.

Docs: development.md (env `DATABASE_URL`, pipeline order gains `data:seed`,
Neon setup via Vercel Marketplace), tech-stack.md, project-structure.md,
project-overview.md ("adding a province" steps), game-flow.md, CLAUDE.md quick
reference (generated-data note, client-safety note gains pano-db).

## Steps

1. Install deps.
2. `pano-db.js` + test harness (mock-neon, fake-neon, fixtures) — TDD the
   adapter.
3. Rewrite `pano-index.js` + rework its tests.
4. Update `mapillary.js`, coverage route, route tests.
5. Seed script + a vitest file exercising its QA/verify logic against PGlite
   and fixture artifacts.
6. Pipeline path redirect, barrel removal, repo cleanup, guard-test updates.
7. Docs.

## Validation

`npm test` (all files), `npm run lint`, `npm run build:check`. Real-Neon seeding
is user-run: provision Neon on Vercel Marketplace, set `DATABASE_URL` locally,
run the pipeline then `npm run data:seed`.

## Risk / rollback

Single commit; revert restores JSON-bundled behavior. Live table swap keeps
`panoramas_old` as backup for one generation.
