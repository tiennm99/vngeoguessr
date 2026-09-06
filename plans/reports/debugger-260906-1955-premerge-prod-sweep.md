# Pre-merge runtime sweep — feat/game-region-path-segment @ 76e72c0 (fresh prod build)

Method: `npm run build` (fresh, `.next` removed first) then `npx next start -p 3400`
(port 3000's dev server left untouched). Verified build freshness before trusting
it: `.next/server/app/game/{hn-badinh,vn}.html` timestamped 19:53, ~1 min before
the sweep, route table listed all 85 `/game/*` SSG pages. Driven with
`@playwright/test` chromium via scratch `tmp-prod-sweep.mjs` / `tmp-theme-check.mjs`
at repo root (API/tile stubs mirrored `tests/e2e/helpers.js` exactly). Both
scripts deleted after the run; server process (PID 20660) killed; `git status`
clean at finish (verified below).

## MUST-VERIFY — PASS/FAIL

1. **No "Encountered a script tag" warning anywhere, incl. `/game/notaregion`.**
   PASS. Grepped the full captured console/pageerror/response log (137 entries,
   every route incl. the region-404 client shell) for "script tag" — zero
   matches.

2. **Pre-paint theme script executes on hard loads; served head carries
   `<script type="text/javascript">`.**
   PASS. `page.request.get` (no JS execution) on both `/` and `/game/tphcm`
   confirms the raw served HTML `<head>` contains
   `<script type="text/javascript">(function(){try{...` verbatim. Static build
   output (`.next/server/app/index.html`, `.next/server/app/game/vn.html`)
   independently shows the same via grep before the server even started.

3. **No theme flash: dark-theme visitor's first paint is already dark.**
   PASS. Method: new browser context with `colorScheme: 'dark'` +
   `localStorage['vngeoguessr_theme']='dark'` seeded via `addInitScript` (runs
   before any page script), `page.goto(..., { waitUntil: 'domcontentloaded' })`.
   DOMContentLoaded fires only after the parser has synchronously executed the
   blocking inline `<head>` script and reached `</html>` — before React
   hydration (which is async) can have run. At that instant, for both `/` and
   `/game/tphcm`: `document.documentElement.className === "dark"`,
   `document.documentElement.style.colorScheme === "dark"`, and
   `getComputedStyle(document.body).backgroundColor` was `lab(2.75 0 0)`
   (near-black, i.e. globals.css's dark background token already applied) —
   not the light-theme white. This is the parser having run the script before
   any paint of body content, not a post-hoc correction.
   (An earlier probe using `waitUntil: 'commit'` showed an empty class — that
   is `commit` firing on response-start, before the parser has even reached
   `<head>`; not evidence of a flash, just too early a checkpoint. Superseded
   by the domcontentloaded check above.)

4. **Per-region `<title>` in served HTML.**
   PASS. Raw HTML fetch: `/game/hn-badinh` → `<title>Ba Dinh — VNGeoGuessr</title>`;
   `/game/vn` → `<title>Vietnam — VNGeoGuessr</title>`. Exact match to spec.

5. **`/game/notaregion` → HTTP 404 (not 500), working exit link.**
   PASS. `page.goto` response status = 404 (confirms `generateMetadata` did not
   throw — a throw there 500s before any status is set). Rendered panel:
   "No such region" with a "Pick a region" link to `/`, `getByRole('link', {name: /Pick a region/i})`
   count = 1.

## Route-by-route findings

All console.error/console.warning/pageerror/requestfailed/response>=400 entries
below, deduplicated by pattern; full JSON capture retained in this session's
scratchpad only (not committed).

| Route | Result |
|---|---|
| `/` (landing, region picker) | CLEAN except known noise (Vercel insights/speed-insights 404, Leaflet CSS preload-unused warning). Picker rendered 16 clickable controls; province expand clicks did not error. |
| `/game/tphcm` (stubbed, full round: goto → map click → guess submit → next round) | CLEAN except known noise (Vercel 404s, WebGL GPU-stall x2). All three interaction steps (map click, submit click, next-round click) succeeded — no "click failed" fallback fired. |
| `/game/vn` (stubbed render) | CLEAN except known noise (Vercel 404s, WebGL GPU-stall x1). |
| `/game/hn-badinh` (stubbed render) | CLEAN except known noise (Vercel 404s, WebGL GPU-stall x1, "message will no longer repeat" — driver de-duping its own spam). |
| `/game/notaregion` (region 404) | HTTP 404 confirmed (see must-verify 5). No app console error beyond the browser's own "Failed to load resource" self-log for the 404 response and the Vercel-noise 404s — all expected/documented. |
| `/game/hn-bad%C4%B1nh` (dotless-i homoglyph) | HTTP 404 — correctly rejected, `regionFromSlug`'s round-trip check (`src/lib/regions.js:81-86`) does not accept a Unicode uppercase-fold that isn't the canonical lowercase spelling. Only noise entries otherwise. |
| `/nosuchpath` (app-wide 404) | HTTP 404, served from `src/app/not-found.js`. CLEAN except noise. |
| `/game/%74phcm` (percent-encoded, decodes to `tphcm`) | HTTP 200 as documented (`regionFromSlug`'s docstring: router decodes the segment before the route sees it, so this is indistinguishable from `/game/tphcm`). CLEAN. |
| `/game?region=TPHCM` | 307/redirect → `/game/tphcm`, final status 200. CLEAN. |
| `/game?location=TPHCM` | Same redirect target/result. CLEAN. |
| `/credits` | 200, CLEAN except Vercel noise. |
| `/debug` | 200, CLEAN except Vercel noise. |
| `/debug/bbox` | 200, CLEAN except Vercel noise. |
| `/debug/coverage` | 200, CLEAN except Vercel noise (this route also shares the Leaflet chunk per prior sweep's memory note, none fired here). |
| theme=light `/` | CLEAN except Vercel noise. |
| theme=dark `/` | CLEAN except Vercel noise. |
| theme=system, mid-session OS flip on `/game/notaregion` | Confirmed working: class was `"dark"` before the flip (context started with `colorScheme: 'dark'`, no explicit stored choice → falls to `system` → matches OS), then after `page.emulateMedia({ colorScheme: 'light' })` the class became `""` (light) — `RegionNotFound`'s `watchSystemTheme` re-apply effect (`src/app/game/[region]/not-found.js:31-35`) picked up the OS change live. This is correct 'system' behavior, not a defect. |

No `pageerror` fired on any route in the entire sweep. No response returned
5xx anywhere. No hydration-mismatch text observed in any console entry.

## Known environment noise (confirmed present, not defects)

- `/_vercel/insights/script.js`, `/_vercel/speed-insights/script.js` → 404 +
  `requestfailed` (`net::ERR_ABORTED`) on every single route. Matches
  `.claude/agent-memory/debugger/local-runtime-console-noise.md` item 1 exactly
  (local `next start` outside real Vercel infra).
- `[.WebGL-0x...] GPU stall due to ReadPixels` on every `/game/*` route.
  Matches memory item 2 (sandboxed GPU driver advisory, not app code).
- `"...preloaded but not used..."` CSS warning on `/` (Leaflet chunk,
  `33tb0bi_vnuwk.css`). Matches memory item 3 (prod-only `<Link>` prefetch
  heuristic).
- The browser's own `console.error: "Failed to load resource: ... 404"` self-log
  accompanying every 404 response (the two Vercel scripts, plus the route's own
  404 status on `/nosuchpath`, `/game/notaregion`, `/game/hn-bad%C4%B1nh`) — this
  is Chromium logging the failed resource load itself, not app-emitted console
  output. Expected per task's environment-noise list.

All four match prior memory/task-documented signatures; none re-investigated as
new regressions.

## Cleanup verification

- `tmp-prod-sweep.mjs` and `tmp-theme-check.mjs` deleted.
- Prod server on :3400 (PID 20660) killed; only stale `TIME_WAIT` socket
  remnants remain (self-clearing, not a listening process). Port 3000's
  pre-existing dev server (PID 31588) was never touched.
- `git status` at finish: `nothing to commit, working tree clean`, branch
  `feat/game-region-path-segment` still up to date with origin — no tracked
  file was modified.

## Conclusion

All 5 must-verify items PASS with direct evidence. Every listed route is
CLEAN or shows only previously-documented environment noise. No new console
errors, pageerrors, failed requests, or >=400 responses attributable to app
code were found on this fresh production build. The one earlier-round miss
(a real console error a prior source-only review didn't catch) was not
reproduced here — if it's real, it either requires an interaction path this
sweep didn't hit (e.g. a specific error-recovery path in `GameClient`, a race
under slower network, or a non-stubbed real backend response shape) or it was
already fixed since; this sweep only proves the routes and flows exercised are
clean on this build, not the full state space.

## Unresolved questions

1. The task references "a previous round's source-only reviews missed a real
   console error the user hit" — no route/repro was given, and this sweep
   found none. If a specific route/action/theme combination is known, it
   should be named so it can be targeted directly rather than re-swept blind.
2. This sweep did not exercise: an actual guess-submission race under the real
   (non-stubbed) `/api/*` handlers against Neon/Redis, mobile viewport sizes,
   or a `light`→`dark`→`light` OS flip mid-round (only mid-404-page was
   tested per the task's explicit instruction). Flag if any of those matter
   for merge sign-off.
