---
title: "Applied fixes verification: feat/game-region-path-segment (uncommitted)"
plan: plans/260906-1122-game-region-path-segment/plan.md
branch: feat/game-region-path-segment
date: 2026-09-06
status: DONE_WITH_CONCERNS
sources:
  - plans/reports/fix-260906-1717-review-findings-resolved.md
  - plans/reports/code-reviewer-260906-1659-region-path-diff-review.md
---

# Applied fixes verification

Adversarial review of the uncommitted working-tree changes (9 files) on top of
the 3 committed branch commits. All 5 claims hold. One new Medium finding, two
Lows, one residual the new comments overstate.

## Gates actually run

| Gate | Result |
|---|---|
| `npm test` | 19 files, **268 passed**, 5.3s |
| `npm run lint` | **0 errors, 19 warnings**; none in a changed file (all pre-existing `react-hooks/*`) |
| `npm run build` | clean, Next 16.3.3 Turbopack, 101 static pages, `/game/[region]` still SSG x85 |
| `npx playwright test tests/e2e/routing.spec.js --workers=1` | **14/14 passed**, 17.6s |

Two measurement caveats, neither a defect in the diff:

- First `npm run lint` crashed with `ENOENT: no such file or directory, scandir
  'test-results'` — eslint walked a Playwright artifact dir a concurrent run was
  writing. `.gitignore` has `/test-results/`; `eslint.config.mjs` `ignores` does
  not. Clean on re-run.
- The full e2e spec at default worker count timed out on the 8 game-page tests
  (60s each); all pass in 15s with `--workers=1`. Coincided with a peer agent
  editing `not-found.js` mid-run (Turbopack dev recompile). Not the diff.

No dev server left running; ports 3000-3019 confirmed free at exit.

## Claim-by-claim

### 1. `regionFromSlug` round-trip guard — VERIFIED

`src/lib/regions.js:75-80`.

- All 85 codes match `/^[A-Z0-9-]+$/` (checked against the real tree), so for
  any pure-ASCII input the guard is a tautology: **0 wrong rejections** over
  1955 generated re-casings (all-lower, all-upper, alternating, 20 random per
  code).
- Brute-forced every code point `U+0080..U+10FFFF` for a residual bypass — a
  char whose `toUpperCase()` is ASCII `[A-Z0-9-]` **and** whose `toLowerCase()`
  equals that uppercase lowercased. **Zero hits.** Covers dotless i (U+0131),
  long s (U+017F), Kelvin sign (U+212A), Angstrom (U+212B), capital sharp s
  (U+1E9E) and the `ﬁ`-class ligatures (multi-char expansions compared as whole
  strings, not per char).
- `toUpperCase`/`toLowerCase` are locale-independent by spec
  (`toLocaleUpperCase` is the locale-sensitive pair), so a `tr-TR` server locale
  cannot reintroduce the İ/ı problem. Turkish dotted İ (U+0130) and `i`+U+0307
  both 404 live.
- Live statuses (dev :3011): `/game/TPHCM` 200, `/game/TpHcM` 200,
  `/game/hn-badinh` 200, `/game/hn-bad%C4%B1nh` 404, `/game/hn-%C5%BFontay` 404,
  `/game/hn-bad%C4%B0nh` 404, `/game/hn-badi%CC%87nh` 404, `/game/%E2%84%AAhn` 404.

**Residual — the comment overstates (Medium-low).** Percent-encoded ASCII is
still accepted and is neither normalised nor redirected: `GET /game/%74phcm`
returns **200**, final URL unchanged. That is a distinct URL string with its own
cache entry and its own analytics row — precisely the argument used to justify
the guard. So `src/lib/regions.js:66` ("Re-casing is the ONLY accepted
difference") and the matching `docs/game-flow.md` bullet are false as written.
Narrow the wording to *case*, or close the family.

### 2. `generateMetadata` — VERIFIED

`src/app/game/[region]/page.js:40-56`.

- Guard holds. `/game/notaregion` returns **404, not 500**, in dev (:3011) and
  in production `next start` (:3012); the title falls back to the root
  `VNGeoGuessr`, which is the `return {}` branch executing. `notFound()` still
  injects `<meta name="robots">`.
- API usage matches Next 16.3.3 docs (`generate-metadata.md`, `not-found.md`):
  `params` awaited as a Promise, no `metadata` export in the same segment,
  server component (no `"use client"`), `{}` inherits the parent.
- `regionPath(code).slice(1).reverse().join(', ')` correct at all three levels,
  read out of the prerendered HTML:
  - `game/vn.html` → `Vietnam — VNGeoGuessr` / "…in Vietnam" (`|| name` fallback fires)
  - `game/tphcm.html` → `Ho Chi Minh — VNGeoGuessr` / "…in Ho Chi Minh"
  - `game/hn-badinh.html` → `Ba Dinh — VNGeoGuessr` / "…in Ba Dinh, Ha Noi"
- No new data reach: `regionFromSlug` + `getRegion` + `regionPath` are sync tree
  lookups, no fetch, no N+1, build still prerenders all 85.
- The comment at `page.js:47` said "Outermost first" (the opposite of the
  produced order) when I started; a peer corrected it to "Narrowest first"
  mid-review. Resolved in the tree.

**Informational.** An unplayable region now advertises a round it cannot serve:
`/game/dn-hoangsa` gets "Guess where you are in Hoang Sa, Da Nang, from street
view." while the page renders the no-coverage panel.

### 3. Panel contrast + 404 label — VERIFIED

`NotFoundPanel.js:31` is `text-foreground text-sm`; "Go to VNGeoGuessr" is
present in the production `/nosuchpath` HTML with `href="/"`. The 4.05:1 /
3.09:1 figures in the comment are carried from the ui-ux report and were not
re-measured here.

### 4. `watchSystemTheme` subscription — VERIFIED, one doc caveat

`src/app/game/[region]/not-found.js:26-30`. `reapply` is declared inside the
effect and calls `getStoredTheme()` fresh on every invocation, so no stale
closure; the unsubscribe is returned from the effect; `applyTheme` is idempotent
(`classList.toggle(_, bool)` plus a direct `colorScheme` assign), so the
mount-time call plus a later OS flip cannot double-apply.

**Low.** It diverges from `ThemeToggle.js:36-38`, which subscribes **only** when
the choice is `'system'`. This one subscribes unconditionally and leans on
`applyTheme(getStoredTheme())` being a no-op for an explicit light/dark choice —
true, but it makes `src/lib/theme.js:76` ("The callback fires only while
following the system") false for the second caller. That line described
ThemeToggle's gating, not the function. Fix the JSDoc or gate the subscription.

### 5. Tests — VERIFIED, and proven load-bearing

Not phantom tests. During my run a peer agent mutated both `actionHref` values to
`/broken`; both 404 e2e tests then failed at `routing.spec.js:147` — the new
`toHaveAttribute('href', '/')` assertions. The mutation has since been reverted.
The two unit lines and the percent-encoded homoglyph e2e case all exercise the
guard and fail without it.

## New finding (Medium): the region-404 "renders inside the root layout" claim is not what the assertion proves

Measured server responses, dev **and** `next start`:

| Request | shell | `Made by` | `No such region` | `<title>` |
|---|---|---|---|---|
| `GET /game/notaregion` | `<html id="__next_error__">` | **0** | **0** | `VNGeoGuessr` |
| `GET /nosuchpath` | root layout | 1 | — | — |

The region 404's server response carries neither the root layout nor the panel —
18.7 KB of error shell. The heading, the exit link and the footer all appear only
after hydration, which is why Playwright's `getByText('Made by')` passes.
Consequences:

1. `tests/e2e/routing.spec.js:149-152` — "this is the assertion that catches a
   collapsed first paint" — is wrong. The assertion runs against the hydrated
   DOM and cannot see first paint. Finding P3 ("region 404 centring unverified")
   remains unverified for first paint.
2. `fix-260906-1717` section P3, "the region 404 does render inside the root
   layout, so the panel centres", is true post-hydration only.
3. `not-found.js:19` calls the cost "a light flash before hydration". The real
   first paint is an **empty** error shell — no heading, no way out, no footer.
   Same root cause as the `Encountered a script tag while rendering React
   component … never executed` warning in the Playwright log: the root layout's
   pre-paint theme `<script>` is being client-rendered here.

The claim-4 fix's premise (the shell has no working theme script) is confirmed
correct. Only the described cost and the scope of the new assertion overstate.

## Recommended actions

1. Narrow "the ONLY accepted difference" in `src/lib/regions.js:66` and the
   matching `docs/game-flow.md` bullet to *case* — `/game/%74phcm` is 200 today.
2. Fix `src/lib/theme.js:76` JSDoc, or gate the new subscription on `'system'`
   as `ThemeToggle` does.
3. Correct the `routing.spec.js` footer-assertion comment and the
   `not-found.js` "light flash" comment: the region-404 first paint is empty,
   not merely light-themed.
4. Optional: add `test-results/**` and `playwright-report/**` to
   `eslint.config.mjs` `ignores` so `npm run lint` cannot crash mid-e2e.

## Metrics

- Type coverage: N/A (JavaScript-only project, no type checker).
- Tests: 268 unit passing; routing e2e 14/14 serial.
- Lint: 0 errors, 19 warnings, 0 in changed files.

## Unresolved questions

1. Is the empty first paint on `/game/notaregion` acceptable, or should the
   region 404 be reached without `notFound()` (render the panel from the page
   with a 404 status) so it prerenders inside the root layout the way
   `/nosuchpath` does?
2. Is `/game/%74phcm` returning 200 acceptable, given the duplicate-URL argument
   that justified the case guard?
