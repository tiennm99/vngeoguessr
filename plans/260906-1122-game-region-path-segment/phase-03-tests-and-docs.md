---
phase: 3
title: "Tests and docs"
status: completed
priority: P2
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Tests and docs

## Overview

Move the e2e specs onto the new URLs, add coverage for the redirect and 404
behavior that did not exist before, and update the docs that describe the game
route.

## Requirements

**Functional**
- Every e2e spec navigates to and asserts the new URL shape.
- New e2e coverage for: legacy `?region=` redirect, legacy `?location=`
  redirect, bare `/game`, and an unknown region 404.
- Docs describe `/game/{REGION}` and record that the legacy query forms
  redirect.

**Non-functional**
- No weakening of an existing assertion to make it pass. If a spec fails
  because behavior genuinely changed, fix the code or change the assertion
  deliberately — never loosen a matcher to get green.

## Architecture

**The four e2e touch points**, verified by grep:

| File:line | Current | Becomes |
|---|---|---|
| `tests/e2e/game.spec.js:14` | `page.goto('/game?region=TPHCM')` | `page.goto('/game/TPHCM')` |
| `tests/e2e/home.spec.js:26` | `toHaveAttribute('href', '/game?region=TPHCM-Q7')` | `'/game/TPHCM-Q7'` |
| `tests/e2e/username.spec.js:28` | `toHaveURL(/\/game\?region=VN/)` | `toHaveURL(/\/game\/VN/)` |
| `tests/e2e/username.spec.js:39` | same | same |

**New spec: URL compatibility.** The redirects are the part of this change most
likely to break silently and most costly when they do — a dead bookmark gives no
error anyone sees. A small dedicated spec is the only thing that will notice a
regression. It covers the five shapes from Phase 2's step 5 plus the 404.

Playwright follows redirects by default, so asserting the *final* URL after
`page.goto()` is the natural check. For the 404, assert on the response status
via the return value of `page.goto()` rather than on page text, which would
couple the test to the not-found page's wording.

**Docs.** `docs/game-flow.md:11` mentions `/game` in the context of a
deep-linked player being auto-named — still true, but the URL shape it implies
is now stale. Discover the full set of owning docs through the root `README.md`
and the `docs/` navigation rather than assuming this one line is all of it;
`docs/project-structure.md` describes the directory layout and gains a new
`app/game/[region]/` entry.

## Related Code Files

- Modify: `tests/e2e/game.spec.js`
- Modify: `tests/e2e/home.spec.js`
- Modify: `tests/e2e/username.spec.js`
- Create: `tests/e2e/routing.spec.js`
- Modify: `docs/game-flow.md`, `docs/project-structure.md` (confirm ownership
  first — see Architecture)

## Implementation Steps

1. Update the four navigation/assertion sites in the table above.

2. **Create `tests/e2e/routing.spec.js`** covering:
   - `/game/TPHCM` serves 200 with no redirect.
   - `/game?region=TPHCM` ends at `/game/TPHCM`.
   - `/game?location=TPHCM` ends at `/game/TPHCM`.
   - `/game?region=TPHCM&location=HN` ends at `/game/TPHCM` (region wins).
   - `/game` ends at `/game/VN`.
   - `/game?region=` (empty) ends at `/game/VN`.
   - `/game/hn` ends at `/game/HN`.
   - `/game/NOTAREGION` responds 404.

   These need the API stubs from `helpers.js` for the shapes that actually
   render a round; the redirect assertions themselves do not, but an
   unstubbed page will try to reach Mapillary. Reuse `stubGameApis` as the
   other specs do rather than inventing a second stubbing path.

3. **Run the e2e suite.** It was 9/9 before this plan; it should now be 9 plus
   the new routing cases, all green. A pre-existing spec that fails is a real
   regression from Phases 1-2 — fix the code, not the spec.

4. **Update docs.** Resolve the owning surface via `README.md` and the `docs/`
   navigation, then record:
   - The game URL is `/game/{REGION}`, e.g. `/game/TPHCM`, `/game/VN`.
   - `?region=` and `?location=` redirect and are kept for existing links.
   - Bare `/game` goes to the country round.
   - An unknown region 404s; a real region without coverage shows the coverage
     message.

   Link `src/lib/regions.js` as the source of valid codes rather than listing
   ~70 of them in prose.

5. **Note the API/page distinction explicitly in the docs.** The most likely
   future mistake this change creates is someone "finishing the migration" by
   moving `/api/new-game?region=` to a path segment too. State that API routes
   deliberately keep their query params.

6. Run the full gate: `npm test`, `npm run lint`, `npm run build`,
   `npm run test:e2e`.

## Todo

- [x] Four existing e2e sites updated
- [x] `tests/e2e/routing.spec.js` with all eight cases
- [x] Full e2e suite green, no pre-existing spec weakened
- [x] Docs updated on the correct owning surface
- [x] Docs state that API routes keep `?region=` deliberately
- [x] `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e` green

## Success Criteria

- [x] All eight routing cases pass as e2e assertions, not just manual checks
- [x] The pre-existing 9 specs still pass with assertions no weaker than before
- [x] No `game?region` or `game?location` string remains in `tests/` or `docs/`
- [x] Docs describe the new URL shape and the legacy redirects
- [x] Whole-plan check: every Success Criterion in `plan.md` is met

## Risk Assessment

**Playwright's `toHaveURL` passes on a partial match.** The existing specs use
regexes like `/\/game\?region=VN/`. A naive rewrite to `/\/game\/VN/` would also
match `/game/VNSOMETHING`. Signal: none — it silently passes. Response: anchor
the new regexes (`/\/game\/VN$/`) or assert on an exact string.

**The 404 assertion couples to not-found page wording.** Signal: the spec breaks
when someone restyles the 404 page. Response: assert on
`response.status() === 404` from `page.goto()`'s return value, never on visible
text. Specified in Architecture for this reason.

**Assumption that may break:** that the Playwright config's `baseURL` points at
a server running the production build. Redirects declared in `next.config.mjs`
apply in dev and production alike, so either works — but `generateStaticParams`
prerendering only happens in a build. Signal: routing specs pass locally and
fail in CI, or vice versa. Response: check `playwright.config.js`'s `webServer`
command; if it runs `next dev`, the routing specs still exercise the redirects
correctly and that is what they are for. Do not switch the whole suite to a
production build just for this.

**Docs drift back.** This plan's URL shape will be re-described by anyone who
next edits the game flow. Response: keep the docs statement short and link
`src/lib/regions.js` for codes — a list of 70 codes in prose is what actually
rots.
