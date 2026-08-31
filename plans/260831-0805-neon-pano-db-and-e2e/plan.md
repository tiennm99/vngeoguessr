# Neon pano store + Playwright E2E

Status: DONE (reviewed, review findings fixed, pending commit)
Branch: main

## Execution notes (2026-08-31)

- Phase 1 done: Neon seeded with 424,617 rows; real-DB smoke test of
  pickRandomPano/countPanos/getRegionPanoSample passed (4 draws in 792ms).
  Vitest 223/223 in ~3s (was 274 in ~15s -- the 51 dropped tests are the
  real-data invariants now enforced by `npm run data:seed`'s gate).
- Added mid-flight at user request: dependency upgrades -- Next 15.5→16.3.3
  (eslint.config.mjs moved to native flat config; two new React-Compiler-era
  hook rules downgraded to warn deliberately), React 19.2.8, lucide-react 1.x,
  turf 7.4, upstash 1.38.3; `uuid` package replaced by crypto.randomUUID.
  ESLint stayed on ^9: eslint 10 breaks eslint-config-next's scope manager.
- Phase 2 done: 9/9 Playwright specs green in 13s, fully stubbed, no env.
- Next dev appended its agent-rules block to CLAUDE.md; kept as instructed by
  the block itself.
- Code review (DONE_WITH_CONCERNS) findings all fixed: infra errors no longer
  masquerade as missing coverage (mapillary.js rethrows non-pool errors);
  composite (province,id)/(district,id) indexes added and reseeded; the table
  swap is now one transaction; stale count-cache self-heals; sample stride
  floors; ANY() params cast ::text[]; OSM tiles stubbed in E2E;
  reuseExistingServer gated on !CI; dead error branch removed; doc drift fixed;
  @eslint/eslintrc removed. Validation gate extracted to
  scripts/lib/pano-artifacts.mjs with its own test file (234 vitest total).
- Reviewer questions resolved: NULL-district runtime fallback kept alongside
  the unassigned==0 seed gate (schema tolerates partial data, pipeline
  guarantees none -- documented in pano-artifacts.mjs); panoramas_old retention
  is the intended one-generation backup (~2x rows, well under the free tier);
  the unauthenticated debug coverage route now costs metered Neon compute --
  surfaced to the user, accepted trade-off pending their veto.

## Outcome

1. Panorama index served from Neon Postgres instead of 28MB JSON bundled from
   `src/data/panos/`; offline pipeline writes local artifacts (gitignored) and a
   seed script pushes them to the DB. JSON leaves the repo.
2. Playwright E2E smoke tests for the manual-test-only UI, runnable offline with
   zero secrets via browser-level API stubbing.

## Constraints

- JavaScript only, individual function parameters.
- Keep Upstash for sessions/leaderboards; keep gameplay behavior identical.
- Answer secrecy invariant: coordinates/district never reach the client before
  the guess. `pano-db.js` joins the server-only forbidden-import list.
- Neon free tier; `@neondatabase/serverless` HTTP driver (works on Vercel).
- `npm test` must keep running with no external service: PGlite (in-memory
  Postgres) mocked in at the `@neondatabase/serverless` boundary, mirroring
  `tests/mock-upstash.js`.

## Non-goals

No TypeScript, no auth/player IDs, no game-model or scoring changes, no
leaderboard migration to Postgres.

## Phases

1. [phase-01-neon-pano-db.md](phase-01-neon-pano-db.md) — schema, adapter,
   async pano picking, seed script, pipeline redirect, repo cleanup, test rework.
2. [phase-02-playwright-e2e.md](phase-02-playwright-e2e.md) — Playwright setup
   and smoke specs with stubbed APIs. Independent of phase 1 at runtime,
   executed after it.

## Acceptance criteria

- Game plays unchanged with `DATABASE_URL` set (user verifies on deploy; local
  verification via PGlite-backed unit tests + `npm run build:check`).
- `npm test` green with no service; data-quality invariants that used to run in
  vitest against real JSON now run inside the seed script.
- `src/data/panos/*.json` removed from git; pipeline writes `data-build/panos/`.
- `npm run test:e2e` passes offline with no env vars.
- Docs updated (development, tech-stack, project-structure, game-flow, CLAUDE.md
  quick ref). Config-file changes (package.json, .gitignore,
  playwright.config.mjs, vitest.config.mjs) highlighted to user.

## Risks

- Cannot verify against real Neon in this session (no credentials). Mitigation:
  PGlite is real Postgres semantics; SQL kept to portable core; setup steps
  documented for the user.
- Reseed downtime: avoided by staging-table + rename swap; old table kept one
  generation as `panoramas_old` (backup-before-change rule).
- E2E flake on PhotoSphere viewer with a synthetic image: fixture is a real
  2:1 equirect PNG; specs assert viewer container/canvas, not pixel output.

## Rollback

Phase 1 is one commit: revert restores bundled-JSON behavior (JSON re-enters
repo via `git revert`). Phase 2 is additive tooling.
