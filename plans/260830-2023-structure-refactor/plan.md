# Behavior-Preserving Structure Refactor

Status: done (all 6 phases; @/ alias conversion skipped — vitest has no alias
config, conversion would break test imports for no functional gain) | Branch:
main | Source: structure review 2026-08-30
Validated: eslint 0 errors/0 warnings, 258/258 tests, build:check green,
src/data diff empty.

Contract: improve structure per review; zero behavior change (wire responses,
UI copy/classes, score thresholds, generated data all identical). Excluded as
behavior changes: new-game 200-status fix, new-game POST removal, result-copy
consolidation, Upstash pipelining, skip-race/error-state fixes.

## Phases

1. **Split `src/lib/game.js` by layer** — keep scoring (`SCORE_BANDS`,
   `calculateScore`, `calculateDistance`, `formatDistance`); new
   `src/lib/username.js` (localStorage, mirrors `theme.js`); presentation
   helpers move to their single consumers. Thresholds/strings verbatim.
2. **Decompose `GameClient.js`** — extract `ResultMap.js`,
   `RoundResultDialog.js`, `GuessMapPanel.js`; collapse 8 result fields into
   one `result` object. Retry loop dies with the conditional container.
3. **Extract `LeaderboardModal.js`** from `page.js`; drop the
   `exhaustive-deps` suppression via `useCallback`.
4. **Invert client-safety test** — walk from every `'use client'` file,
   assert none reaches `data/panos`, `pano-index`, `data/boundaries`.
   Server-only header added to boundaries generator (lands on next regen).
5. **Pipeline tooling** — `scripts/lib/paths.mjs` (import.meta.url-based),
   `scripts/lib/barrel.mjs` (shared emitter + byte-identity test vs current
   generated barrels), npm scripts `data:boundaries|panos|districts`.
6. **Mechanical** — lint → `eslint .` + ignores, fix 4 warnings, `@/` alias,
   delete `tabs.jsx` + dead code + `allowScripts`, README refresh, docs drift.

Validation per phase: `npm test`; final: lint + `npm run build:check` +
`git diff --stat src/data` (must be empty).

Rollback: each phase is an independent commit-sized unit; revert file moves.
