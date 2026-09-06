---
name: local-runtime-console-noise
description: three recurring non-defect console/network noise sources when driving this app locally with a real browser (Playwright) — don't re-diagnose them as bugs
metadata:
  type: project
---

Proven 2026-09-06 during a full runtime console sweep of
`feat/game-region-path-segment` (all routes, dev + local `next start` prod,
report: `plans/reports/debugger-260906-1848-runtime-console-sweep.md`).

1. **`/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` →
   404, prod (`next start`) only, every route.** `@vercel/analytics` /
   `@vercel/speed-insights` (`src/app/layout.js`) fetch these from Vercel's
   edge platform; a local `next start` has no such endpoint. Dev mode skips
   the fetch entirely (analytics runs in its own debug mode). Not present on
   the real Vercel deployment — an artifact of testing prod build outside
   Vercel's infra, not a code defect.

2. **`[.WebGL-0x...] GPU stall due to ReadPixels` driver warning on every
   `/game/*` route** (panorama viewer's WebGL canvas), both dev and prod.
   Chromium/ANGLE driver performance advisory tied to this sandbox's
   virtual/software GPU doing a canvas readback. Not JS, not app code.

3. **"preloaded but not used" CSS warning on `/`, prod only** for chunk hash
   matching Leaflet's CSS (shared by `/game/[region]` and `/debug/coverage`,
   confirmed via `.next/server/app/*/page_client-reference-manifest.js`).
   Next's production `<Link>` prefetch preloads the target route's CSS ahead
   of a click; the browser's own "unused preload" heuristic fires if the
   visitor hasn't navigated within a few seconds. Inherent to prod-only Link
   prefetch, not a bug.

**Why this matters:** these three showed up repeatedly across every route in
the full sweep and would otherwise look like a wall of new regressions.
[[windows-isr-case-collision]] covers a separate local-build-only pitfall
(ISR cache case-folding); this file covers browser-console noise instead.

**How to apply:** when a future runtime sweep on this project reports one of
these three signatures, don't re-investigate from scratch — confirm it still
matches this pattern (same env, same route shape) and move on. Also: when
testing a route with a live map (Leaflet/OSM/Geoapify tiles) or continuous
canvas rendering, `page.goto(..., { waitUntil: 'networkidle' })` can spuriously
time out or produce `requestfailed`/`ERR_ABORTED` noise purely from the test
harness's own wait-condition or page-close timing — re-verify with
`waitUntil: 'load'` plus a fixed settle delay before treating it as a real
hang.
