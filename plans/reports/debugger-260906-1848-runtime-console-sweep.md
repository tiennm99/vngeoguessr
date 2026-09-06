# Runtime console sweep — feat/game-region-path-segment

Method: Playwright chromium, real browser, hard loads + client-side nav, both
`next dev` (reused existing server, PID 33376, :3000) and a fresh `next build`
+ `next start -p 3300` (prod, stopped after use, no orphan). Game-screen API
calls stubbed via page.route mirroring `tests/e2e/helpers.js` for deterministic
runs, plus one un-stubbed run per env to see real API behavior. Captured:
console error/warning, pageerror, requestfailed, response>=400, HTML scan for
hydration-mismatch text. Scratch scripts were `tmp-*.mjs` at repo root,
deleted after use — repo is clean (verified `git status`).

## Result: no app-code defects found

Every route swept CLEAN of app-level console errors/warnings, pageerrors, and
hydration mismatches, in both dev and prod. Three categories of noise showed
up and are NOT app defects (evidence and reasoning below).

## Routes swept

`/` (light/dark/system, hard load + accordion-expand + client nav to
`/game/vn`), `/game/tphcm`, `/game/vn`, `/game/hn-badinh` (stubbed and, for
tphcm, un-stubbed real-API), `/game/notaregion`, `/game/hn-bad%C4%B1nh`,
`/nosuchpath` (light/dark + a mid-session OS flip on notaregion),
`/game?region=TPHCM`, `/game?location=TPHCM`, `/credits`, `/debug`,
`/debug/bbox`, `/debug/coverage` (light/dark) — all in both dev (:3000) and
prod (:3300). Plus a full interactive round-trip: guess click → submit →
next-round → Back to menu, and landing → client nav to `/game/vn`, in both
envs.

## Known-fixed items — confirmed still fixed

- "Encountered a script tag while rendering React component": absent
  everywhere, dev and prod, including `/game/notaregion` (the one route that
  renders the root layout client-side, per the comment in
  `src/app/game/[region]/not-found.js:13-26`). `InlineScript.js`'s type swap
  holds.
- Theme script executes on a hard load: `document.documentElement.className`
  contains `"dark"` for a dark-theme visitor on `/` and `/game/tphcm`, both
  dev and prod. Confirmed via direct DOM read, not just visual.
- `/game/notaregion` re-applies theme after an OS flip: emulated light→dark
  mid-session while parked on that route, `html` class went `""` → `"dark"`,
  both envs.
- The 404 routes' own "Failed to load resource: ... 404 (Not Found)"
  console.error is present (inherent) and is the ONLY console.error on those
  routes — not re-reported as new.

## Noise ruled out (not app defects)

**1. `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` →
404, prod only, every route.**
`@vercel/analytics`'s `<Analytics />` / `<SpeedInsights />` (`src/app/layout.js:5-6,72-73`)
fetch these from Vercel's edge platform when actually deployed there; a local
`next start` has no such endpoint, so it 404s and Playwright logs
`requestfailed ... net::ERR_ABORTED` + the standard "Failed to load resource"
console.error. Confirmed absent in dev (Analytics runs in debug mode locally
and skips the fetch — visible in dev console as
`[Vercel Web Analytics] Debug mode is enabled by default in development`).
This is a local-`next start`-without-Vercel-platform artifact, not something
that will occur on the real Vercel deployment. Not a code defect.

**2. WebGL "GPU stall due to ReadPixels" driver warning on every `/game/*`
route, dev and prod.**
`[.WebGL-0x...]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High):
GPU stall due to ReadPixels` — a Chromium/ANGLE driver performance advisory
tied to this sandbox's software/virtual GPU reading back a canvas frame (the
panorama viewer's WebGL canvas). Not JS, not from application code, and not
present on non-panorama routes. Environmental noise.

**3. CSS "preloaded but not used" warning on `/`, prod only.**
`The resource http://localhost:3300/_next/static/chunks/33tb0bi_vnuwk.css was
preloaded using link preload but not used within a few seconds...` — fires on
a plain hard load of `/`, no interaction needed, prod only (absent in dev,
where Next serves CSS differently). Traced: `.next/server/app/game/[region]/page_client-reference-manifest.js`
and `.next/server/app/debug/coverage/page_client-reference-manifest.js` both
reference this chunk hash — it's Leaflet's CSS (`leaflet/dist/leaflet.css`,
imported by both `CoverageMap.js` and the game map). Next's production Link
prefetch (`<Link href="/game/...">` on the region picker) preloads the target
route's CSS ahead of navigation; since the visitor hasn't clicked yet, the
browser's own "unused preload" heuristic fires a few seconds later. This is
inherent to Next's prefetch-on-viewport behavior for a `<Link>` to a
CSS-bearing dynamic route, not an app bug — matches the task's own note that
"Prefetch and some behaviors are production-only."

**4. Two goto-timeout / requestfailed items from the automated sweep script
itself, both eliminated as script artifacts, not reproduced against the real
app:**
- `/debug/coverage` (dev): `page.goto` timed out waiting for `networkidle`.
  Root cause: the coverage map holds live OSM/Geoapify tile traffic open
  indefinitely, so "no network activity for 500ms" never arrives — a
  wait-condition mismatch in my sweep script, not the page. Re-verified with
  `waitUntil: 'load'` + 5s settle: page renders fully (184,799 panos, region
  picker, snapshot date), zero console errors/warnings.
- `/game/tphcm` (prod, stubbed, dark): one `networkidle` timeout in the full
  sweep run. Re-ran the identical goto 3x back-to-back immediately after:
  reached networkidle in ~1.1s every time. Traced the full request log for
  the route with stubs active — everything (new-game, pano image, 8 map
  tiles) finishes within ~2s of load, nothing lingers. The one timeout was
  resource contention from many sequential browser contexts in one long test
  process, not a real hang.
- Also traced a `net::ERR_ABORTED` on `.../33tb0bi_vnuwk.css` logged for
  `/game/notaregion` (prod, dark) in the same full-sweep run: isolated re-test
  shows that request completes 200 in ~150ms; the abort was the sweep script
  closing its browser context 800ms after load while the request was still
  in flight — an artifact of my harness's page.close() timing, not a broken
  asset.

## Unstubbed real-API check

`/game/tphcm` loaded with the real `/api/new-game` (no stub) in both dev and
prod: real Neon/Redis-backed response succeeded, zero console errors. Real
backend is reachable and healthy in this environment, so this sweep did not
get to observe a genuine API-failure rendering path — noted as an unresolved
question below.

## Full interactive round-trip (stubbed)

Landing → click region card → `/game/vn` (client nav, no full reload) → clean.
`/game/tphcm` → click map to place guess → Submit → result dialog → Next round
→ Back to menu → back at `/` → clean, dev and prod. No hydration-mismatch
text found in any captured HTML.

## Unresolved questions

- Never observed a genuine backend failure (DB/Redis down, Mapillary error)
  in-browser, since the real APIs in this environment are live and healthy —
  only the stubbed-success path and the "real API happens to succeed" path
  were exercised for error-boundary behavior. If the user wants that path
  covered, it needs either an intentionally-broken backend or route
  interception that returns a 500/error payload.
- Did not test `prefers-reduced-motion` or mobile viewport emulation — out of
  the requested scope but worth flagging since the task covers theme/OS
  emulation specifically.
