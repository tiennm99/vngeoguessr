---
title: "Code review: game region as a path segment"
plan: plans/260906-1122-game-region-path-segment/plan.md
branch: feat/game-region-path-segment
reviewed: 2026-09-06
status: DONE_WITH_CONCERNS
---

# Code review: game region as a path segment

## Scope

- Modified: `src/app/game/page.js`, `src/app/components/GameClient.js`,
  `src/app/components/RegionPicker.js`, `tests/regions.test.js`,
  `tests/e2e/{game,home,username}.spec.js`, `docs/game-flow.md`,
  `docs/project-structure.md`
- New: `src/app/game/[region]/page.js`, `tests/e2e/routing.spec.js`
- ~97 insertions / ~47 deletions across 9 tracked files plus 2 untracked
- `next.config.mjs` verified byte-identical to `main`

## Overall assessment

The migration is correct, narrow, and matches the plan's contract. Every
acceptance criterion I could check statically holds. The deliberate deviation
from D4 is not just acceptable, it is better than the plan — see below. Two
things are worth fixing before this lands: an unvalidated string interpolated
into a `redirect()` target, and a JSDoc block that describes state the code no
longer has.

## The D4 deviation: endorsed

The premise is documented, not inferred:
`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md:43`
— "When a redirect is applied, any query values provided in the request will be
passed through to the redirect destination." The rewrite-only query-suppression
behavior (`rewrites.md:131`) does not apply to `redirects()`. So the config rule
would indeed have parked `?region=TPHCM` on `/game/TPHCM` permanently, and the
plan's own named fallback is the right landing spot.

Two bonuses the plan did not anticipate:

- The handler uppercases while building the destination, so `?region=hn` reaches
  `/game/HN` in one hop instead of the two-hop chain D4 had to reason about.
  That also deletes the loop risk the plan's risk table carried.
- `next.config.mjs` stays untouched, which matters under the CLAUDE.md rule that
  config changes get flagged for manual processing.

Cost: `/game` reads `searchParams`, which opts it into dynamic rendering
(`page.md:119`) — matching the observed `f (Dynamic)`. That is inherent to
reading a query string at all and cannot be avoided while the legacy shape is
supported. One function invocation per legacy hit; the traffic is bookmarks and
old links. Correct trade.

I found no unhandled legacy shape. `?city=` was never read by the old page
(`main`'s `GameClient.js:171` read `region || location || 'TPHCM'`) — it is an
API-only alias in `region-request.js:29` and stays that way.

## Critical

None.

## High

### H1 — Unvalidated legacy value interpolated into the redirect target

`src/app/game/page.js:44`

```js
const code = legacy ? legacy.toUpperCase() : COUNTRY_CODE;
redirect(`/game/${code}`);
```

`legacy` is an attacker-controllable, URL-decoded query value that goes straight
into a `Location` header with no encoding and no validation. Two reachable
shapes:

- **Control characters.** `?region=a%0d%0ab` decodes to `"a\r\nb"`. Node rejects
  invalid header characters (`ERR_INVALID_CHAR`), so this returns a 500 rather
  than the honest 404 the file's own comment promises.
- **Dot segments.** `?region=..%2F..%2Fdebug` decodes to `../../debug`, giving
  `Location: /game/../../debug`, which every browser normalizes to `/debug`. A
  crafted "legacy" link can therefore land a user on an arbitrary path.

I worked the URL-resolution algorithm through for the protocol-relative case
(`?region=..%2F..%2F%2Fevil.com`) and the result stays same-origin, because the
`Location` value itself begins with `/game/` and is resolved against the request
origin — so this is **not** an open redirect. The reason to fix it anyway is
that the safety argument depends on browser normalization behavior, and the fix
costs one call:

```js
redirect(`/game/${encodeURIComponent(code)}`);
```

That preserves the documented intent exactly — a real-but-unknown code still
lands on `/game/{CODE}` and 404s there, because region codes are `[A-Z0-9-]` and
`encodeURIComponent` round-trips them (already asserted by the new test in
`tests/regions.test.js`). Alternatively guard with `isRegion(code)` and
`notFound()` before redirecting, but the encode is smaller and keeps the
existing behavior.

Note the sibling file already gets this right by construction:
`src/app/game/[region]/page.js:35` only redirects *after* `isRegion(code)` has
passed, so its interpolated value is always a known-safe code.

## Medium

### M1 — JSDoc on `GameClient` describes state that was deleted

`src/app/components/GameClient.js:44-49`

> "The state still exists because a round load reads it after mount; it is never
> set to anything but this prop."

There is no such state. `const [location, setLocation] = useState('TPHCM')` was
removed in this diff and nothing replaced it; `region` is read directly from
props at lines 96, 174, 295, 336, 364, 372. This reads like a leftover from an
earlier draft that kept the state and seeded it from the prop. A future reader
will go looking for a `useState` that is not there. Delete the last sentence;
the first two are accurate and useful.

### M2 — `GameClient` silently ignores a `region` prop change

`src/app/components/GameClient.js:171-175`

```js
useEffect(() => {
  if (initialized) return;
  ...
  loadLibrariesAndInitialize(region);
}, [region, loadLibrariesAndInitialize, initialized]);
```

`region` is in the dependency array but the `initialized` guard makes it inert.
If this component ever receives a new `region` without unmounting, the URL says
one region while the game keeps serving rounds from another — the player sees
`/game/VN` in the address bar and Ho Chi Minh in the header.

**Not reachable today**, and **not a regression**: the same shape existed on
`main` with `searchParams`, and the only in-component navigation is
`router.push('/')` (line 377), so every path between two regions passes through
`/` and remounts. But a path segment makes this the *normal* App Router pattern
in a way a query param did not, and the next person to add a region switcher on
the game screen will hit it. One-word fix at the page:

```js
return <GameClient key={code} region={code} />;
```

That forces a remount on region change and deletes the whole class. Cheaper than
the alternative of making the init effect region-aware, which would have to
unwind `initializingRef`, `roundEpochRef`, and the prefetch.

### M3 — The change creates a user-reachable 404 with no way out

There is no `not-found.js` anywhere under `src/app`, so `notFound()` at
`src/app/game/[region]/page.js:30` renders Next's stock "404 | This page could
not be found" inside the root layout — no header, no link back to the region
picker. Goal 4 deliberately turned an unknown region into a 404, so this is new
surface reachable by a typo'd or truncated shared link. A minimal
`src/app/game/[region]/not-found.js` pointing back at `/` would close it.
Flagged rather than blocking: it is arguably a follow-up, but it is a direct
consequence of this change rather than pre-existing.

## Low

- **L1** — `tests/e2e/routing.spec.js:11` hardcodes
  `const BASE = 'http://localhost:3000'`, duplicating `playwright.config.js`'s
  `use.baseURL`. Asserting `page.url()` exactly is the right call (it is what
  proves no query string survives the redirect, which is the whole point of the
  deviation), but the host coupling is avoidable — derive `BASE` from the config
  or assert `pathname + search`.
- **L2** — The `GameClient` JSDoc has no `@param` entries. The repo documents
  component props elsewhere (`RegionPicker.js:41-48` documents all four). Add
  `@param {Object} props` / `@param {string} props.region` for consistency.
- **L3** — `dynamicParams` is left at its default `true`, so an unknown region is
  rendered on demand rather than served from a static 404. This is *required* by
  D3 — `dynamicParams = false` would 404 `/game/hn` instead of redirecting it —
  so the current setting is correct. Recording it because it is the kind of thing
  a later "optimization" will try to change.

## Checklist results

| Area | Result |
|---|---|
| Concurrency / async ordering | Clean. `roundEpochRef`/`appliedEpochRef` guards, the 15s watchdog (`:229-235`), the prefetch consume-once path (`:307-337`), and the skip/retry flows are byte-identical apart from the identifier swap. `loadRound` and `loadLibrariesAndInitialize` take the code as a parameter, so their `useCallback` deps (`[applyRound]`, `[loadRound]`) correctly did not need to change. |
| Error boundaries | `redirect()` and `notFound()` are not wrapped in `try`/`catch` in either page — correct, both signal by throwing. |
| API contracts | `firstValue` (`game/page.js:14-17`) handles all three shapes Next documents for a search param (`string`, `string[]`, `undefined`, per `page.md:75`) plus the `''` case. Precedence `region` then `location` matches `main`'s `GameClient.js:171` exactly. |
| Backwards compatibility | `/game`'s region-less default changes `TPHCM` to `VN` — intentional (D6), documented in `docs/game-flow.md:33`. No API route touched; `resolveRegion`'s `region`/`city` aliases untouched. |
| Input validation | See H1. The `[region]` route validates correctly (`isRegion` before use, before redirect). |
| Auth / authz | No sensitive operation on either page; both are anonymous public routes. |
| Query efficiency | Neither page touches a database. 85 prerendered pages, each a thin client shell. |
| Data leaks | **Clean, and this is the one that mattered.** `src/app/game/[region]/page.js` imports only `next/navigation`, `GameClient`, and `../../../lib/regions` — no path to `pano-index.js`, `pano-db.js`, `pano-history`, or `data/panos`. It passes exactly one prop, `region={code}`. The prerendered HTML is identical for every visitor. |
| Stale identifiers | A word-boundary grep for a bare `location` over `GameClient.js` returns only two UI strings ("Skip this location"). No bare `location` survives, so the `window.location` shadowing hazard is genuinely closed. |
| Plan fact-check | Every file path and symbol in the plan verified against the tree. `useSearchParams` and `Suspense`: zero occurrences anywhere in `src/`. |

One coverage caveat on the data-leak check: the import-walk in
`tests/regions.test.js` that guards the *other* direction only visits files
carrying a `'use client'` directive. A Server Component that imported
`pano-index.js` and passed the result down as a prop would not be caught. That
is a pre-existing shape of the test, and this page does not do it — but the new
route is the first Server Component in the game path, so the blind spot is now
one refactor closer to mattering.

## Acceptance criteria

| # | Criterion | Verdict |
|---|---|---|
| 1 | `/game/{TPHCM,VN,HN-BADINH}` play | Met — `generateStaticParams` over `allRegions()`, e2e asserts TPHCM |
| 2 | `?region=` / `?location=` redirect | Met — `game/page.js:41-44`, two e2e cases |
| 3 | `/game` to `/game/VN` | Met — `COUNTRY_CODE` fallback, e2e case |
| 4 | `/game/hn` to `/game/HN` | Met — `[region]/page.js:35`, e2e case |
| 5 | `/game/NOTAREGION` 404s | Met — asserted on status, not wording |
| 6 | Unplayable region renders, not 404 | Met for routing; **not** end-to-end (see coverage note) |
| 7 | No `?region=` in `src/` outside API call sites | Met — remaining hits are comments and `api/` + `lib/region-request.js` |
| 8 | No `useSearchParams` in the game route | Met — zero in all of `src/` |
| 9 | `region` beats `location` | Met — the `||` chain plus a dedicated e2e case |

Phase 3 asked for 8 routing cases; 10 shipped. The two extras (one-hop lowercase
legacy, real-but-unplayable region) are the two most valuable additions.

Phase 3's own success criterion "No `game?region` or `game?location` string
remains in `tests/`" is unmeetable and wrong — `routing.spec.js` must navigate to
those URLs to test them. The implementation is right; the criterion is not.

## Verification claims: sanity check

- **`npm run lint` 0 errors.** Confirmed independently on the touched files. The
  only warnings are `react-hooks/set-state-in-effect` at `RegionPicker.js:130`
  and `GameClient.js:173`, both pre-existing (the latter is
  `setUsernameState(...)`, untouched by this diff, at `main`'s line ~172).
- **`npm test`.** Ran the narrowest relevant file: `tests/regions.test.js`,
  25/25 green including the new URL-safety test. Did not re-run the full suite.
- **The 4 pre-existing e2e failures.** `username.spec.js:17` asserts
  `getByRole('dialog')` is hidden on landing. `src/app/page.js:49-53` opens the
  username modal on landing whenever no name is stored, with a comment saying
  that is deliberate. Direct, verified contradiction — those specs fail on `main`
  for a reason that has nothing to do with routing. The second spec fails the
  same way (the open overlay intercepts the Play click) even though it does not
  assert the premise itself. **Your reading is correct.** I did not independently
  reproduce the `home.spec.js` clipboard failure, but nothing in this diff
  touches the build-sha footer, so I have no reason to doubt it.
- **One methodology gap worth confirming.** Two of the artifacts under review are
  untracked (`src/app/game/[region]/page.js`, `tests/e2e/routing.spec.js`) and
  plain `git stash` does **not** stash untracked files. If the `main` baselines
  were taken without `-u`, the new route and the new spec were present during the
  "baseline" run. The reported e2e totals are consistent with `-u` having been
  used (22 on-branch = 12 pre-existing + 10 new; 8 pass / 4 fail among the 12),
  so this is probably fine — but please confirm, because without `-u` the routing
  spec would have run against the old `/game` page and mostly failed.

## Coverage notes

- **AC 6 is only half-tested.** `routing.spec.js:77-92` stubs `/api/new-game`
  with a fixed TPHCM response, so `/game/TPHCM-CUCHI` renders a normal round, not
  the coverage panel. The spec says so in its own comment and asserts only status
  and URL, which is the honest scope — the routing half is what changed. But the
  net effect is that **no test anywhere proves the game screen renders the
  coverage error for a real unplayable region**; `region-request.test.js` proves
  the API produces the message, and nothing joins the two. A pre-existing gap
  this change surfaces rather than creates. Worth keeping: the spec guards its
  own fixture with `expect(isPlayable(code)).toBe(false)`, so it fails loudly if
  Cu Chi ever gains coverage instead of silently testing nothing.
- **The 2 updated `username.spec.js` URL assertions never execute** (the spec
  fails earlier at the dialog click). The residual gap is thin, not zero: what
  goes untested is specifically that `router.push(pendingHref)` at `page.js:65`
  resumes into the new URL shape. `home.spec.js:26` already asserts the href
  `PlayRow` produces, and `pendingHref` is that same string, so the uncovered
  link in the chain is one `router.push` of an already-asserted value. I would
  not block on it. The right fix is to correct `username.spec.js`'s premise to
  match the deliberate landing-modal behavior — a separate change, since it
  reverses an assertion this plan never touched.

## Recommended actions

1. `encodeURIComponent(code)` in `src/app/game/page.js:44` (H1).
2. Delete the stale "The state still exists..." sentence from the `GameClient`
   JSDoc (M1).
3. Add `key={code}` to `<GameClient>` in `src/app/game/[region]/page.js:37` (M2).
4. Consider `src/app/game/[region]/not-found.js` (M3) — this change or the next.
5. Follow-up, separate change: repair `username.spec.js`'s landing-modal premise
   so its URL assertions actually run.

## Unresolved questions

1. Was `git stash -u` used for the `main` baselines? Without it the two untracked
   files were present in the "baseline" runs.
2. M3 — is a game-specific `not-found.js` in scope here, or a follow-up?
