---
phase: 2
title: "Callers and redirects"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Callers and redirects

## Overview

Point every in-app link at the new route, and make every URL shape that used to
work keep working: `?region=`, `?location=`, and bare `/game`.

This is the phase that must not be split from Phase 1 in a release — Phase 1
alone leaves the app linking to the old URL, and this phase alone would break
every existing link.

## Requirements

**Functional**
- `RegionPicker` emits `/game/{code}` hrefs.
- `/game?region=X` and `/game?location=X` redirect to `/game/X`.
- Bare `/game` redirects to `/game/VN`.
- No redirect loops, including the `?region=hn` → `/game/hn` → `/game/HN` chain.

**Non-functional**
- The modified-click passthrough in `PlayRow` keeps working: cmd/ctrl/shift/
  alt-click must still open a new tab (`RegionPicker.js:57-60`).
- No API route touched. `/api/new-game?region=` and friends keep their query
  params, and `src/lib/region-request.js` is not modified.

## Architecture

**Two config redirects plus one page redirect.**

```
/game?region=X   ─┐
                  ├─ next.config.mjs redirects()  ─→  /game/X
/game?location=X ─┘

/game            ─── app/game/page.js redirect()  ─→  /game/VN

/game/x          ─── the page's casing guard      ─→  /game/X   (Phase 1)
```

The config rules use a named capture group, which is what makes the value
available in the destination — verified at
`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md:196-208`:

```js
async redirects() {
  return [
    {
      source: '/game',
      has: [{ type: 'query', key: 'region', value: '(?<region>.+)' }],
      destination: '/game/:region',
      permanent: false,
    },
    {
      source: '/game',
      has: [{ type: 'query', key: 'location', value: '(?<location>.+)' }],
      destination: '/game/:location',
      permanent: false,
    },
  ];
}
```

**Order matters.** `region` first: a URL carrying both params must resolve the
same way `GameClient.js:171` resolved it, which preferred `region`.

**`.+` not `.*`.** A present-but-empty `?region=` must fall through to the bare-
`/game` handling rather than redirecting to `/game/`. This mirrors the reasoning
already written at `region-request.js:28-31`, where `||` is used over `??` for
exactly this case.

**Why bare `/game` redirects in the page, not the config.** A config rule with
no `has` condition would match `/game?region=X` too and race the other two. A
`redirect()` inside `app/game/page.js` only ever runs when no config rule
matched, which is precisely the bare case.

**`permanent: false`.** See D5 in `plan.md` — 307 now, 308 only once the URLs
have been live and correct for a while. A wrong 308 is cached in browsers and
very hard to retract.

## Related Code Files

- Modify: `next.config.mjs` (add `redirects()`)
- Modify: `src/app/game/page.js` (reduce to a redirect to `/game/VN`)
- Modify: `src/app/components/RegionPicker.js` (href construction)

## Implementation Steps

1. **`RegionPicker.js:52`** — change `const href = \`/game?region=${code}\`;` to
   `` const href = `/game/${code}`; ``. Nothing else in `PlayRow` changes: the
   modified-click guard and the `onPlayClick` interception both operate on
   `href` and stay correct.

2. **`next.config.mjs`** — add the `redirects()` function above to the exported
   config object, beside the existing `env` and `distDir` keys. Do not disturb
   `resolveCommitSha()` or the `distDir` comment explaining the
   dev-server/build collision.

3. **`src/app/game/page.js`** — reduce to a Server Component that calls
   `redirect('/game/VN')` from `next/navigation`. Delete `GameLoadingFallback`,
   the `Suspense` import and the `"use client"` directive: none have a purpose
   once the page neither renders `GameClient` nor reads search params.

   Note this changes the region-less default from `TPHCM` to `VN` — see D6 in
   `plan.md` and Open Question 1. If the answer comes back "keep TPHCM",
   this one string is the only thing that changes.

4. **Grep for stragglers:** `grep -rn "game?region\|game?location" src/` must
   return nothing. (API-route call sites build `?region=` for `/api/...` URLs —
   those are correct and must stay.)

5. Verify manually across all five shapes: `/game/TPHCM`, `/game?region=TPHCM`,
   `/game?location=TPHCM`, `/game`, `/game?region=` (empty). Confirm each lands
   where the plan says, and watch the network panel for a redirect **chain
   longer than two hops** — there should never be one.

6. Verify cmd-click on a region row still opens a new tab.

7. Run `npm run lint`, `npm run build`, `npm test`.

## Todo

- [x] `RegionPicker.js` href → `/game/${code}`
- [x] `redirects()` in `next.config.mjs`, `region` rule before `location`
- [x] `app/game/page.js` reduced to `redirect('/game/VN')`
- [x] Grep clean of `game?region` / `game?location` in `src/`
- [x] All five URL shapes verified manually
- [x] Modified-click passthrough verified
- [x] `npm run lint`, `npm run build`, `npm test` green

## Success Criteria

- [x] `/game?region=TPHCM` → `/game/TPHCM`, one hop
- [x] `/game?location=TPHCM` → `/game/TPHCM`, one hop
- [x] `/game?region=hn` → `/game/hn` → `/game/HN`, exactly two hops, terminates
- [x] `/game` → `/game/VN`
- [x] `/game?region=` (empty) → `/game/VN`, not `/game/`
- [x] `/game?region=TPHCM&location=HN` → `/game/TPHCM` (region wins, matching
      the old precedence)
- [x] Cmd/ctrl-click on a region row opens a new tab
- [x] No API route changed; `src/lib/region-request.js` untouched

## Risk Assessment

**Redirect loop.** The specific danger is a config rule whose destination still
matches its own source. `/game?region=X` → `/game/X` is safe because the
destination has a different path *and* no query. Signal: the browser reports too
many redirects on any of the five shapes. Response: step 5 checks all five
explicitly before the phase is called done; a loop means the `source` is too
broad — narrow it, do not add a counter or a bail-out param.

**A stale link somewhere outside `src/`.** The grep in step 4 covers `src/`, but
`README`, `docs/`, and the e2e specs may carry old URLs. The specs are Phase 3's
job; docs are too. Signal: a doc example that 307s. Response: Phase 3 sweeps
both — do not treat step 4's clean grep as proof the repo is clean.

**Assumption that may break:** that `has` with a named capture group works in
Next 16.3.3 as the bundled docs describe. The docs shipped with this exact
version, so the risk is low but not zero. Signal: `/game?region=X` redirects to
the literal `/game/:region`. Response: fall back to handling both legacy params
inside `app/game/page.js` — read `searchParams`, validate, and `redirect()`.
That is one file instead of a config rule and works regardless.

**The empty-param case is easy to get wrong.** `.+` vs `.*` is the whole
difference between `/game?region=` landing on `/game/VN` and landing on a
broken `/game/`. Signal: a 404 on `/game/`. Response: it is in the success
criteria for exactly this reason — test it, do not reason about it.
