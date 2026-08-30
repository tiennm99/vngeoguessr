---
name: project-quality-gates-blind-spots
description: This repo's three quality gates (lint, build:check, vitest) cannot catch undefined identifiers or any UI regression, so never treat "all green" as evidence a component works
metadata:
  type: project
---

`npm run lint`, `npm run build:check` and `npx vitest run` all pass on code that
throws `ReferenceError` at runtime.

**Why:** the repo is JavaScript-only by policy (no TS), ESLint extends only
`next/core-web-vitals`, which enables neither `no-undef` nor `no-unused-vars`;
the Next.js production build does not type-check JS; and `tests/` contains no
component tests and no `@testing-library` dependency — every suite is lib/API
level. Verified 2026-08-30 while reviewing the Phase 5 region-navigation UI:
`GameClient.js` kept ten calls to `setGlobalRank` / `setCityRank` /
`setGlobalScore` / `setCityScore` / `setGlobalDistanceRank` /
`setCityDistanceRank` after their `useState` declarations were deleted, and all
three gates were clean.

**How to apply:** when a diff removes or renames state, props, helpers, or
imports, grep the whole file for the old identifiers rather than trusting the
gates. For any React change, also state plainly in the report which criteria are
runtime-only and therefore unverified by static review. Related:
[[project-anti-cheat-invariant]] — same lesson, a passing test is not the
property.
