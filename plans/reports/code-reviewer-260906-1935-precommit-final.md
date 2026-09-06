# Pre-commit review — `feat/game-region-path-segment`

Date: 2026-09-06 19:35 · Reviewer: code-reviewer · Scope: 3 commits + uncommitted tree + 2 untracked files, as one shipping unit.

## Verdict

**Safe to commit.** All four gates green on the tree as it stands. Four findings, all Medium/Low hardening, none blocking. No Critical, no High.

## Gates (real output, this tree)

| Gate | Result |
|---|---|
| `npm test` | 19 files, **268 passed** (7.97s) — matches baseline |
| `npm run lint` | **0 errors, 19 warnings** — matches baseline |
| `npm run build:check` | exit 0, **101/101 pages**, `/game/[region]` SSG = vn + hn + hn-badinh + 82 more = **85 paths** |
| `npx playwright test` | **28 passed** (19.8s), 8 workers, reused the existing :3000 dev server |

Dev server on :3000 (PID 33376) was pre-existing; reused, not started, not killed.

**Transient, now gone:** at 19:38 a `throw new Error('TEST: Breaking route to verify warm-up does not hide failures')` was present at `src/app/game/[region]/page.js:69` and failed `build:check` (prerender error on 4 pages, exit 1). It was removed before my second run. The current tree greps clean of `TEST:`/`TODO`/`FIXME` and of any new `console.log`. Re-grep immediately before committing.

---

## PRIORITY 1 — `tests/e2e/global-setup.js` + `playwright.config.mjs:15`

### Q1: Does the catch mask a genuinely broken route? **No. CONFIRMED, not inferred.**

`fetch` rejects only on network-layer failure — it resolves normally on any HTTP status. Measured against the live server:

```
404 route: fetch resolved, status 404 ok false -> catch NOT entered
dead port: threw ECONNREFUSED                  -> catch entered
```

So a route that starts 500ing produces a resolved response, the catch is never reached, and every spec that navigates there still fails on its own assertion. The parent's own broken-route experiment corroborates: with `page.js` throwing, `build:check` failed loudly.

The catch can therefore only fire when the origin is unreachable — and `WebServerPlugin.setup()` has already polled `http://localhost:3000` to a response before globalSetup is entered (see Q3), so reaching it means the server died in between, which fails every test anyway. **The swallow does not convert red into green. It must not be narrowed into a gate** — a gate would also be wrong on the merits, since `/game/notaregion` is *expected* to be non-2xx.

**It should log, though.** See Finding 1.

### Q2: `config.projects[0].use.baseURL` — reliable? **Yes. CONFIRMED by source.**

- `node_modules/playwright/lib/common/index.js:641` — `use: mergeObjects(config.use, projectConfig.use, configCLIOverrides.use)`. The top-level `use.baseURL` (`playwright.config.mjs:24`) is merged into **every** project's resolved `use`. Reordering projects cannot break it.
- `node_modules/playwright/lib/runner/index.js:5960` — `this.filteredProjects = filterProjects(config.projects, options.projectFilter)`. `--project` writes to a **separate** array; the `config.projects` handed to globalSetup is unfiltered. `--project=chromium` and `--project=<other>` both leave index 0 intact.

No finding.

### Q3: Does it run after `webServer` is up? **Yes. CONFIRMED by source. Cold CI is safe.**

`node_modules/playwright/lib/runner/index.js:6003`:

```js
function createGlobalSetupTasks(config) {
  return [
    createRemoveOutputDirsTask(),
    ...createPluginSetupTasks(config),   // <- WebServerPlugin.setup() lives here
    ...config.globalTeardowns...reverse(),
    ...config.globalSetups.map(...)      // <- globalSetup runs last
  ];
}
```

`WebServerPlugin.setup()` awaits `_startProcess()` then `_waitForProcess()`, which polls `webServer.url` until it answers or the 120s `webServer.timeout` expires (throwing if it does). On a cold CI machine the server has already served a response to `/` before the first warm-up fetch is issued. No race.

### Q4: Does warming `/game/notaregion` have a cache/ISR side effect? **No, for the lane as configured.**

The lane runs `npm run dev`; `next dev` does not populate the incremental cache for page renders, and the only assertions on that URL are status 404 + a heading, which a cached 404 would still satisfy. The one edge: `reuseExistingServer: !process.env.CI` means a developer with `npm start` on :3000 gets the suite adopted onto a production server, where the warm-up mints a year-long ISR 404 entry for `/game/notaregion` — the already-recorded, already-accepted unknown-region ISR decision, now also reachable from the test lane. Worth knowing, not worth changing.

### Q5: Right layer? **Yes.**

- `webServer.url` addresses exactly one URL and is checked *before* globalSetup — it can warm `/`, never the three `/game/*` shapes. Cannot solve this.
- A fixture runs per-worker (8x) or per-test — that reintroduces the very contention that causes the block.
- Raising `timeout` does not fix it: it is already 60s and 8 workers queue behind one compile; you would be buying slowness, not correctness.
- A setup *project* with `dependencies:` would work but costs a project, a spec file, and a test that asserts nothing.

globalSetup is the least machinery that runs exactly once, serially, after the server is up. Keep it.

---

## PRIORITY 2 — `src/app/components/InlineScript.js`

Matches Next 16.3.3's own documented cure verbatim (`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md:122-140`). React/react-dom 19.2.8. I re-verified the four things the prior pass could have missed, empirically:

- **Prod output** — `.next-check/server/app/game/tphcm.html`: exactly **1** `<script type="text/javascript">` in `<head>`, containing `classList.toggle`; **zero** occurrences of `text/plain` in `<head>`. The pre-paint script ships executable in the real build, not just in dev.
- **`<head>` hoisting** — not hoisted. React 19 hoists `<script>` only when `async` is set with no `onLoad`/`onError`; this one has neither `src` nor `async`, so it renders in place. Confirmed by reading the emitted head order: it sits after the stylesheets and chunk preloads, inside `<head>`. Stylesheets are render-blocking anyway, so it still beats first paint — and the position is unchanged from the plain `<script>` it replaced.
- **Streaming/Suspense** — `<head>` is in the first flushed chunk; there is no Suspense boundary above the root layout. Verified present in the very first bytes of both the dev response and the prerendered file.
- **Double execution** — impossible. The RSC payload carries a client module reference plus the prop only (`["$","$L1e",null,{"html":"(function(){try{..."}]`), never a rendered executable script. On hydration React matches the existing node and `suppressHydrationWarning` makes the DOM win, so the `text/javascript` → `text/plain` difference is neither patched nor warned. If hydration *fails* and React client-renders the root, InlineScript renders `text/plain` — inert, so still no second execution; and `<html>` carries `suppressHydrationWarning`, so the class and `colorScheme` the script wrote survive.
- **Dev vs prod** — both verified above; the one behavioural difference (the `/game/[region]` error shell client-rendering the layout) is the intended one, documented in `not-found.js` and locked by the new console-error e2e test.

The `'use client'` that the Next doc's copy lacks is required here and correct: the doc's copy is imported *by* a Client Component, this one is imported by the Server Component root layout, where without the directive `typeof window` is always `undefined` and the type swap can never happen.

`dangerouslySetInnerHTML` is fed a module-level template literal interpolating the `THEME_STORAGE_KEY` constant — no request data reaches it. No CSP in `next.config.mjs`, so no nonce plumbing is missing.

**No findings.**

---

## Findings

### 1. `tests/e2e/global-setup.js:21-25` — silent catch erases the only clue for the failure it exists to prevent — MEDIUM, CONFIRMED

Not a masking risk (Q1), but a diagnosis risk. If the dev server restarts between `WebServerPlugin.setup()` and globalSetup — a Windows dev-server crash-restart is the realistic trigger — all four fetches take `ECONNREFUSED`, the warm-up silently does nothing, and the developer gets **exactly** the 8-way 60s timeout block this file was written to prevent, with zero indication the warm-up was skipped. They will re-debug the original problem from scratch.

Keep the swallow (never gate); add the signal:

```js
    } catch (error) {
      // A warm-up is an optimisation, never a gate: if the server is not
      // answering yet, the specs' own waits and retries still apply. But say
      // so, or a skipped warm-up looks exactly like the problem it prevents.
      console.warn(`Warm-up of ${route} failed: ${error.message}`);
    }
```

### 2. `tests/e2e/global-setup.js:20` — unbounded `fetch` can hang the entire run with no output — MEDIUM, PLAUSIBLE

`globalTimeout` is `0` (unlimited) and Node's `fetch` has no default timeout. Scenario: the server accepts connections (so `_waitForProcess()` passed on `/`) but hangs compiling `/game/tphcm` — turbopack stall, wedged Windows FS watcher. `await fetch` never settles and never throws, globalSetup never returns, and Playwright prints nothing after "global setup" until CI's job timeout kills it — no reporter output, no traces, no failing test names.

```js
      await fetch(new URL(route, baseURL), {
        redirect: 'follow',
        // Bounded so a wedged compile fails the warm-up instead of hanging the
        // run: globalTimeout is 0 and fetch has no default.
        signal: AbortSignal.timeout(60_000),
      });
```

The abort rejects into the existing catch, so the suite degrades to the pre-warm-up behaviour (slow, but with real per-test failures) rather than hanging.

Optional, same line, lower value: `await (await fetch(...)).text()` drains the body, guaranteeing the whole render — not just the headers — completed, and releasing the keep-alive socket before 8 workers connect.

### 3. `tests/e2e/routing.spec.js:143` — whole-`<head>` negative assertion is brittle, and the slice can silently widen — LOW, PLAUSIBLE

Two small things in `the pre-paint theme script is served executable`:

- `.not.toContain('text/plain')` scans the *entire* head, which in dev includes Next devtools scripts and preloads this test does not own. Any future Next build that inlines that string in `<head>` fails the test for a reason unrelated to the contract.
- `html.slice(0, html.indexOf('</head>'))` — if `</head>` were ever absent (a truncated or errored stream), `indexOf` returns `-1` and `slice(0, -1)` silently hands back nearly the whole document, so the negative assertion would then scan the body too.

Scope the negative to the script this test owns, and fail loudly on a missing head:

```js
    const end = html.indexOf('</head>');
    expect(end, `${path} served no </head>`).toBeGreaterThan(-1);
    const head = html.slice(0, end);
    ...
    expect(head, `${path} serves the theme script as a data block`)
      .not.toMatch(/<script type="text\/plain">\(function\(\)\{try\{/);
```

### 4. `docs/project-structure.md:162-166` — the e2e paragraph does not mention `global-setup.js` — LOW, CONFIRMED

That paragraph enumerates the directory's non-spec files (`helpers.js`, `fixtures/`), and `playwright.config.mjs` is listed at line 14. A file whose entire purpose is to prevent a confusing 8-way timeout is exactly what a future maintainer deletes as dead weight. One clause on the existing sentence:

> ...all against browser-level stubs in `tests/e2e/helpers.js` with a fixture panorama in `tests/e2e/fixtures/`, after `tests/e2e/global-setup.js` compiles the game routes once so the workers do not race the same cold build.

---

## Confirmed (not re-litigated)

- **`regionFromSlug` round-trip guard** (`src/lib/regions.js:78-84`) — correct and complete. `regionSlug(code) === raw.toLowerCase()` rejects `hn-badınh` (U+0131) and `hn-ſontay` (U+017F) while `TpHcM` still plays. Safe for all 85 codes because `tests/regions.test.js:35-45` asserts every code's slug is `encodeURIComponent`-identical and round-trips. Locked at both layers: unit (`regions.test.js:59-61`) and a real request (`routing.spec.js:108`), both green.
- **`generateMetadata` 404-not-500 guard** (`src/app/game/[region]/page.js`) — resolving via `regionFromSlug` and returning `{}` before `getRegion` is right; `getRegion` throws and metadata resolves before the page. Verified in the built HTML: `hn-badinh` → "Ba Dinh, Ha Noi", `tphcm-cuchi` → "Cu Chi, Ho Chi Minh", and `vn` exercises the `|| name` fallback (`slice(1)` is empty) → "Vietnam". `/game/notaregion` still 404s (e2e green), never 500s.
- **Region-404 theme effect** (`src/app/game/[region]/not-found.js`) — `reapply()` plus `watchSystemTheme(reapply)` with the unsubscribe returned from the effect. No leak, and `watchSystemTheme`'s JSDoc was correctly updated to match the ungated contract (`src/lib/theme.js:77-80`). Green under `routing.spec.js:171`.
- **eslint ignore additions** (`eslint.config.mjs:8-16`) — `test-results/**` and `playwright-report/**` are the real ENOENT source when lint and Playwright run concurrently. Lint still reports 0 errors / 19 warnings, so nothing real was silenced.
- Plan checklists in `plans/260906-1122-game-region-path-segment/` are fully ticked; zero `- [ ]` remain, and the two edits in this tree correct stale casing claims (`/game/vn`, `/game/{slug}`) rather than lowering the bar.

## Recommended actions

1. Re-grep for the removed `TEST:` throw immediately before committing (it was in the tree minutes ago).
2. Apply Finding 1 (log line) and Finding 2 (`AbortSignal.timeout`) — two lines, both in `global-setup.js`.
3. Apply Findings 3 and 4 if bundling; neither justifies a follow-up commit on its own.

## Unresolved questions

1. Is the e2e lane ever run against `npm start` on :3000 in practice? If yes, the warm-up writes a real ISR 404 entry for `/game/notaregion` into `.next/cache` (accepted mechanism, new trigger). If never, ignore.
2. `.claude/agent-memory/debugger/*` is committed to the repo. It is already tracked on main, so I did not treat it as scope creep — flagging only in case the untracked `local-runtime-console-noise.md` was meant to stay local.
