---
title: Structure refactor
date: 2026-08-30
summary: "Behavior-preserving structure refactor, 6 phases done: split src/lib/game.js by layer (scoring kept; username.js extracted; presentation helpers moved to single consumers), decomposed GameClient.js (ResultMap.js etc). Zero behavior change validated: eslint clean, 258/258 tests, build green, empty src/data diff. @/ alias conversion skipped deliberately - vitest has no alias config, conversion breaks test imports for no functional gain. Excluded as behavior changes (shipped separately): new-game 200-status fix, new-game POST removal, result-copy consolidation. Plan: plans/260830-2023-structure-refactor (completed, archived)."
---

# Structure refactor

Behavior-preserving structure refactor, 6 phases done: split src/lib/game.js by layer (scoring kept; username.js extracted; presentation helpers moved to single consumers), decomposed GameClient.js (ResultMap.js etc). Zero behavior change validated: eslint clean, 258/258 tests, build green, empty src/data diff. @/ alias conversion skipped deliberately - vitest has no alias config, conversion breaks test imports for no functional gain. Excluded as behavior changes (shipped separately): new-game 200-status fix, new-game POST removal, result-copy consolidation. Plan: plans/260830-2023-structure-refactor (completed, archived).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
