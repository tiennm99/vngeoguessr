# Server scoring + leaderboard contract recheck (260831-2145)

Gates: vitest 243/15 pass; eslint 0 errors/16 preexisting warnings; migration lib import smoke OK; node --check migrate-leaderboards.mjs clean.

Overall: no blocking breaking change. Response shapes strictly additive (gameResult.bands, levels[].points). Redis key names, member encodings (username; username:distance:timestamp), trim windows, accumulation arithmetic untouched; no write path can reset/corrupt totals. /api/leaderboard byte-identical. Real contract change is semantic: gameResult.score no longer equals any board delta; leaderboard.message format changed — all in-repo consumers updated in lockstep incl. e2e stub.

## High
- H1 submitRoundScore (leaderboard.js:249-257): only guard is `distance === undefined`; null/''/false → Number() → 0 → 5 points at every level (max reward on absent value). Old submitScore path paid 0 for same garbage. Unreachable from /api/guess today; reachable by any future caller. Fix: `Number.isFinite` + non-negative guard.

## Medium
- M2 semantic change: gameResult.score graded on picked ladder, credited to no board; leaderboard.message now "(+3, +5, +5)" format. In-repo consumers verified updated (GameClient, RoundResultDialog, e2e helpers/spec). No external consumers. Doc one line.
- M3 bandsForBbox/calculateScore return module-level SCORE_BANDS by identity (game.js:61,67); test pins with toBe. One in-place sort/mutation anywhere (server or the new client render path in LeaderboardList) rewrites the base ladder process-wide. Fix: Object.freeze deep, or return copy + relax test to toEqual.
- M4 submitScore now production-dead export (only tests use it as seeding helper); docstring claims callers that don't exist. Delete or relabel as test/backfill primitive.
- M5 bandsForDiagonal(NaN/undefined) → maxMeters NaN → JSON null → "≤NaNm = 5" in dialog. Currently unreachable (only TPHCM-CUCHI lacks bbox; unplayable; bandsForBbox short-circuits). Fix: Number.isFinite factor guard.

## Low
- L6 pre-existing: creditScore zScore→zAdd read-modify-write not atomic; concurrent same-user rounds can lose an increment; adapter lacks zIncrBy. Backlog.
- L7 message "(+3, +5, +5)" unlabelled, duplicates per-card (+N). Consider dropping line.
- L8 Turf on client list-render path via LeaderboardList→bandsForBbox; no new bundle weight (page.js already imported game.js client-side).
- L9 game-flow.md describes only picked-region ladder; add sentence pointing at submitRoundScore per-level crediting.

## Verified clean (evidence)
1. /api/guess field inventory unchanged + additive only; levels[] types unchanged (score/rank null when trimmed).
2. Redis: key builders unchanged (country → leaderboard:vietnam), members, trims (score 0..-(201); distance 200..-1), accumulation `(existing||0)+points`.
3. No board stricter than HEAD: computed all 67 regions' ladders — ≤10km-diagonal districts keep exact base ladder (HN-BADINH 50m→5); larger only widen (DN-HOAVANG 273m, TPHCM 442m, HN 594m, VN 6,380m).
4. calculateScore boundary inclusivity (<=) and default arg preserved; scaling factor ≥1 preserves strict ordering.
5. bands leaks nothing (derives from player-chosen pickedRegion only).
6. Session skew: pickedRegion??cityCode??null guarded by isRegion before consume; pre-tree cityCode always valid uppercase region (verified vs 00a8f8b~1); neither-field shape 500s after consume — identical to HEAD, unreachable (no deploy era wrote it).
7. Callers: only /api/guess changed; migration consumes only leaderboardKeys; plain-node import path unaffected by turf edge.
8. Tests behavioural: guess-route pins district-vs-country property from store readback; leaderboard tests pin per-level points against independently computed ladders.

## Unresolved
1. VN board pays 5 within 6.38km / 1 out to 127.6km mixed with old-ladder points — accepted by owner; makes country board volume-driven.
2. Keep or delete submitScore export?

Status: DONE_WITH_CONCERNS — fixes recommended pre-landing: H1, M3, M4 label, optional M5/L9.
