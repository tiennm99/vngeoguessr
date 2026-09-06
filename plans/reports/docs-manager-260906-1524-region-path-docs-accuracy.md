# Docs accuracy audit: game region path segment

Scope: report only, no files edited. Branch `feat/game-region-path-segment`,
diff vs `main`.

## 1. Claims verified against shipped code

`docs/game-flow.md` "The game URL" subsection (added, ~15 lines) — every claim checked true:

| Claim | Evidence |
|---|---|
| `/game/TPHCM`, `/game/VN`, `/game/HN-BADINH` are valid path shapes | `src/app/game/[region]/page.js` reads `params.region`; `HN-BADINH` confirmed present in `REGIONS` (district, parent `HN`) |
| Unknown region -> 404 | `page.js:30 if (!isRegion(code)) notFound()` |
| Real region with no imagery renders, shows coverage message, not 404 | `page.js` comment + code deliberately calls `allRegions()` not `playableRegions()` in `generateStaticParams` |
| `/game` with no region -> country (`VN`) | `src/app/game/page.js:40 code = legacy ? legacy.toUpperCase() : COUNTRY_CODE` |
| `?region=` and `?location=` redirect to `/game/{CODE}` | `game/page.js:39 firstValue(query.region) || firstValue(query.location)`, confirmed by `tests/e2e/routing.spec.js` |
| API routes (`new-game`, `leaderboard`, debug routes) unchanged, keep query params | `src/app/api/new-game/route.js`, `leaderboard/route.js` both still call `resolvePlayableRegion(searchParams)` / `resolveRegion(searchParams, false)` from `src/lib/region-request.js`; `debug/region-coverage/route.js` still reads `searchParams.get('region')` |

`docs/project-structure.md` two-line replacement (`game/page.js - Main game interface` -> split into `game/[region]/page.js` + `game/page.js` entries) — both new descriptions match the actual files exactly (validate/prerender/404 for `[region]`; legacy-redirect + country-default for `game/page.js`).

Minor precision nit (not wrong, just loose): game-flow.md says "Valid codes are the region tree in `src/lib/regions.js`." The tree data itself is `src/data/regions/index.js` (which `project-structure.md` already documents as "The 67-node tree" — actually 85 nodes now, see below); `lib/regions.js` only exposes `isRegion()`/traversal over it. Low-stakes since `lib/regions.js` is the client-safe entry point a reader would actually open. Optional fix: "the region tree in `src/data/regions/index.js` (validated through `isRegion()` in `src/lib/regions.js`)".

Unrelated pre-existing count error, not caused by this diff: `project-structure.md:91` still says "The 67-node tree" for `regions/index.js`. Actual count is 85 (1 country + 9 provinces + 75 districts, confirmed by loading `REGIONS`), matching game-flow.md's own "75 of them" district count and `not-found.js`'s "85" comment. `67` is stale from before the region-expansion commits already on `main` (`d1332cd feat(regions): open four more provinces for play` etc.) — not introduced by this branch, but sitting right next to content this branch touched. Worth a one-line fix while in the file, though out of this branch's stated scope.

## 2. Stale references elsewhere — none found

Grepped all of `docs/`, `README.md`, `CLAUDE.md` for `/game`, `region=`, `location=`, `searchParams`, `Suspense`, `TPHCM`-as-default.

- No doc ever documented a `useSearchParams`/Suspense boundary for `GameClient.js`, so there is nothing stale to remove there (the removal in `GameClient.js` diff has no docs counterpart to clean up).
- No doc claimed `TPHCM` as the bare-`/game` default before this change; `game/page.js`'s own comment says "the old TPHCM fallback was never a stated default." Confirmed by diff: previous project-structure.md text was just "Main game interface" — genuinely generic, nothing to correct.
- `docs/features.md:95` and `docs/project-overview.md:66` mention `TPHCM` but in unrelated contexts (leaderboard key naming, boundary file example) — not affected by this change.
- `README.md`/`CLAUDE.md` only reference `docs/game-flow.md` by link; both links resolve correctly, no inline routing claims to go stale.

## 3. Docs-index / file-tree gaps in `project-structure.md`

Two new/changed files from this branch are peers of files already listed, and are missing:

- **`src/app/game/[region]/not-found.js`** — not listed. It is the direct implementation of the "unknown region is a 404" behavior game-flow.md now documents, and sits right next to `game/[region]/page.js`, which *is* listed. A reader following "Game Pages" to understand the 404 path finds nothing pointing at this file.
- **`tests/e2e/routing.spec.js`** — not listed in the `## Tests` section's e2e description ("the homepage picker, the username modal, and one full round"). This enumerates the other three specs (`home.spec.js`, `username.spec.js`, `game.spec.js`) by behavior but omits the new fourth spec covering canonical URLs, legacy redirects, casing, and 404s.
- Same gap exists a second time in **`docs/development.md:97-104`**, which independently describes the same e2e suite ("region picker, username modal, one full round") for the `npm run test:e2e` command. This is the duplication risk flagged in the task brief: two docs hand-describe the same spec list, and both are now stale in the same way. Recommend fixing both, and noting that if a third spec file appears, only one of these two should probably enumerate by name going forward (or neither — link the vitest/playwright config instead of listing behaviors).

Nothing listed in `project-structure.md` refers to a file that no longer exists (checked `game/page.js`, still present as the redirect handler under its old path).

## 4. Missing maintainer-trap documentation

**a) API keeps `?region=`, pages use path segment.** Documented — `game-flow.md`'s new "API routes deliberately keep their query params" bullet states this plainly and gives the reason (fetch calls, not navigations). This is the right file: CLAUDE.md and README both route to `game-flow.md` for gameplay flow, and the API routes list in `project-structure.md` has no room for rationale (it's a bare filename+one-line description table). No further doc change needed here. Optional, not required: a two-word cross-reference in `project-structure.md`'s API Routes intro line pointing back to game-flow.md, but this would be pure duplication-avoidance polish, not a gap.

**b) `next.config.mjs` deliberately has no `redirects()` for `/game`.** **Not documented anywhere in `/docs/`.** The full rationale (a config redirect forwards the source query string, producing `/game/TPHCM?region=TPHCM` forever) lives only in the `game/page.js` docblock and is exercised by `tests/e2e/routing.spec.js`'s "canonicalises a lowercase legacy region in one hop" test. `next.config.mjs` itself has zero comment about this — its only comments concern commit-sha resolution and `distDir`. A maintainer who opens `next.config.mjs` to "simplify" the legacy redirect into a `redirects()` entry has no signal there or in any doc that this was already tried and rejected. `project-structure.md`'s Root Directory list currently has a bare one-liner for it: `next.config.mjs - Next.js configuration`.

Recommended owner: `docs/project-structure.md`, Root Directory bullet for `next.config.mjs`. Proposed wording:
> `next.config.mjs` - Next.js configuration. Deliberately has no `redirects()` entry for legacy `/game` links — see `game/page.js`, which builds the destination itself because a config redirect would forward the source query string onto it.

This is a WHERE pointer (to the owning file), not a restatement of the code's WHAT/HOW, consistent with the ownership rule.

## 5. Docs-impact judgement

The two updates made in this branch are the right ones and the right size:
- `game-flow.md` addition is scoped to exactly the new user-visible URL contract (path shape, 404 behavior, legacy redirect, API exception) — no implementation detail (casing normalization internals, `encodeURIComponent` defense, `generateStaticParams`) leaked into prose. Good WHY/WHERE discipline.
- `project-structure.md` change is a minimal split of one stale entry into two accurate ones, matching the actual file split.

Not churn, not under-shot on the two sections themselves. Where it falls short is completeness of the **file-tree/index accuracy** obligation `project-structure.md` already carries for every other page/test peer: the new `not-found.js` and `routing.spec.js` files were added to the repo but not to the file listing that is supposed to represent all such peers, and the pre-existing `67-node` count claim conflicts with the very count this branch's own doc text (`75... districts`) implies. Also short: the next.config.mjs rejected-alternative decision has zero documentation footprint, which is exactly the kind of durable maintainer decision the ownership rule says docs should carry via a WHERE pointer, and its absence is the predictable-mistake risk the task called out.

## Unresolved questions

- Should `docs/development.md`'s e2e description and `docs/project-structure.md`'s Tests section both keep independently enumerating spec files by behavior, or should one of them stop and just point to `tests/e2e/*.spec.js` to avoid this exact double-staleness recurring? Not resolved here — flagging the duplication, not picking the owner.
- Is the `67` -> `85` node-count fix in `project-structure.md:91` in scope for this branch's docs commit, or a separate small fix? It predates this diff.

Status: DONE
Summary: Both docs sections added this branch are factually accurate against the shipped code; no stale URL/Suspense/TPHCM-default references remain elsewhere. Gaps found: `not-found.js` and `routing.spec.js` are missing from `project-structure.md`'s (and `development.md`'s) file/test listings, a pre-existing `67`-node count is now visibly wrong next to this branch's own `75`-district claim, and the deliberate no-`redirects()` decision in `next.config.mjs` has no doc pointer anywhere, which is the exact trap the task asked to check for.
Concerns/Blockers: none blocking; all are small additive fixes, no contradicting evidence found.
