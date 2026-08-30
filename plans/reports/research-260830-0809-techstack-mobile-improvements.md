# Research Report: VNGeoGuessr Tech Stack Review + Mobile Playability

Conducted: 2026-08-30 08:09 (+07)
Scope: whole repo (`src/`, `package.json`, `next.config.mjs`) + external research on imagery sources, map libs, 360 viewers, mobile PWA patterns.

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Methodology](#methodology)
3. [Stack Verdict](#stack-verdict)
4. [Findings — Mobile Playability](#findings--mobile-playability)
5. [Findings — Performance](#findings--performance)
6. [Findings — Correctness & Risk](#findings--correctness--risk)
7. [Findings — Code Quality / DX](#findings--code-quality--dx)
8. [Comparative Analysis](#comparative-analysis)
9. [Recommendations (ranked)](#recommendations-ranked)
10. [Proposed Mobile Layout](#proposed-mobile-layout)
11. [References](#references)
12. [Unresolved Questions](#unresolved-questions)

---

## Executive Summary

The stack is fine. Next 15.5 + React 19 + Tailwind v4 + shadcn/Radix + Leaflet + Photo Sphere Viewer + Upstash Redis is a correct, cheap, boring choice for this game. **Do not rewrite it.** Nothing in the research justifies swapping Leaflet for MapLibre, PSV for Pannellum, or Mapillary for Google Street View (Street View Static bills ~$0.007/pano — a free game cannot absorb that; Mapillary + KartaView stay the only viable free sources).

The real problem is not the stack, it is **the game is close to unplayable on a phone**, and the causes are a handful of concrete lines, not architecture:

1. `touchmoveTwoFingers: true` in `PanoramaViewer.js:66` means one finger does **not** rotate the panorama on touch — it scrolls the page. On a game whose core verb is "look around", this is the single worst bug.
2. The game layout stacks a 45dvh panorama on top of a `min-h-[400px]` map plus buttons, so the page is ~1.6 viewports tall on a phone. The player scrolls between looking and guessing, and every drag fights the page scroll.
3. `thumb_original_url` serves the full-resolution equirectangular (commonly 4–8 MP, multi-MB). On mobile data this dominates round latency and WebGL memory. Mapillary exposes `thumb_2048_url` / `thumb_1024_url` for free.

Second theme: **avoidable weight**. `@turf/turf` (the whole monolith) is imported by `src/lib/game.js`, which is imported by client components — the entire Turf bundle ships to the browser to compute one haversine (`game.js:80-82`). That is the cheapest large win in the repo.

Third theme: **a January-2026 Mapillary bbox constraint may already be silently degrading image fetching** — reported as "bbox must be smaller than 0.01 degrees square". Four of five cities use `mapillaryDelta: 0.005`, producing a window of exactly 0.01°. Unverified against the live API; must be tested before acting.

---

## Methodology

- Sources: 5 parallel web searches + 1 doc fetch + full read of `GameClient.js`, `PanoramaViewer.js`, `LeafletMap.js`, `layout.js`, `lib/mapillary.js`, `lib/game.js`, `page.js`, `package.json`, `next.config.mjs`.
- Recency: 2026 material prioritised.
- Terms: Mapillary API limits 2026, KartaView, Street View Static pricing, MapLibre vs Leaflet mobile, PSV vs Pannellum mobile/gyroscope, GeoGuessr mobile map UX, Next.js PWA 2026.

---

## Stack Verdict

| Layer | Current | Verdict |
|---|---|---|
| Framework | Next 15.5.18 App Router, JS-only | **Keep.** Next 16 exists; low-value upgrade now, but `next lint` is deprecated and removed in 16 — migrate the lint script. |
| UI | Tailwind v4 + shadcn/Radix | **Keep.** Recent semantic-token + dark-mode commit is solid work. |
| Map | Leaflet 1.9.4 + OSM raster | **Keep.** Research consensus: Leaflet has the better out-of-the-box mobile touch experience and smallest bundle; MapLibre's WebGL costs battery and shares the GPU with the panorama viewer on the same screen. Wrong trade for this game. |
| 360 viewer | Photo Sphere Viewer 5 (three.js) | **Keep.** Best-in-class mobile touch + gyroscope plugin. Pannellum is smaller but weaker on gestures — and gyroscope look-around is a *feature you want*, not one to trade away. |
| Imagery | Mapillary Graph API | **Keep as primary.** Free, CC BY-SA. Add KartaView only if coverage gaps hurt. Google Street View Static is disqualified on cost. |
| State/store | Upstash Redis, server-authoritative sessions | **Keep.** Coordinates never leave the server before the guess — correct. |
| Geo math | `@turf/turf` monolith | **Replace** with `@turf/distance` or a 12-line haversine. |
| Tests / CI | None | **Gap.** No test runner, no CI, no typecheck (JS-only by mandate). |

---

## Findings — Mobile Playability

**M1 — One-finger panorama drag is disabled.** `PanoramaViewer.js:66` `touchmoveTwoFingers: true`. That PSV option exists for panoramas embedded in scrolling articles. Here it forces two-finger rotation and hands one-finger drags to the page. Fix: `false`, paired with a non-scrolling game layout (M2).

**M2 — Game screen scrolls.** `GameClient.js` uses `min-h-dvh` + `flex-1 p-3 grid lg:grid-cols-2` with panorama `min-h-[45dvh]` and map `min-h-[400px]`. On a 640px-tall phone that is ~288 + 400 + button row ≈ 750px+ inside a ~588px content area. Consequences: page scroll competes with both the panorama drag and the Leaflet pan; the submit button is often below the fold. The layout must be `h-dvh overflow-hidden` on mobile with the map as an overlay, not a stacked sibling.

**M3 — Established pattern not used: expandable minimap.** GeoGuessr's mobile model (and the userscript history around its desktop "tiny map") converges on: panorama fullscreen, guess map as a collapsed corner minimap or bottom sheet, tap to expand near-fullscreen, place pin, confirm. This is the fix for M2 and it also removes the `min-h-[400px]` map from the flow.

**M4 — No `viewport-fit=cover` / safe-area insets.** `layout.js` exports `viewport` with only `colorScheme`/`themeColor`. On iPhone the home-indicator area can overlap the bottom action row, and there is no notch handling. Add `viewportFit: 'cover'` + `env(safe-area-inset-*)` padding on the action bar.

**M5 — Gyroscope look-around unused.** PSV ships a gyroscope plugin. On mobile, physically turning the phone to look around is the highest-delight, lowest-effort feature available to this project.

**M6 — `alert()` on image-load failure** (`GameClient.js`, `getRandomImage` catch). Blocking, unstyled, and on mobile it is a jarring system modal. Replace with an in-app error state + Retry.

**M7 — Result dialog is tall on mobile.** Score block + two rank grids + 208px map + two buttons inside a `sm:max-w-xl` dialog: on a small phone this overflows and the "Next Round" button lands off-screen. Needs a scrollable body with a pinned action footer.

**M8 — No PWA manifest / service worker.** No `manifest.json`, no icons, no install path. For a casual phone game, "Add to Home Screen" + standalone display mode is a meaningful retention lever, and a cache-first shell makes cold starts feel instant. Note: this game is inherently online (imagery + Redis), so scope offline to the app shell only — do not chase offline gameplay.

---

## Findings — Performance

**P1 — Full-resolution panoramas.** `lib/mapillary.js:62` and `api/new-game/route.js:74` use `thumb_original_url`. Mapillary also returns `thumb_2048_url`, `thumb_1024_url`, `thumb_256_url`. Serving 2048px to phones cuts transfer by roughly an order of magnitude and stays within the ≤4096px guidance for reliable WebGL decoding on mobile GPUs. Highest-impact perf change in the repo.

**P2 — Whole Turf ships to the browser.** `lib/game.js:1` `import * as turf from '@turf/turf'` for exactly one `turf.distance` call. `game.js` is imported by `GameClient.js`, `page.js`, and `LeaderboardList.js` — all `"use client"`. Fix: `@turf/distance` (or inline haversine) — and consider splitting scoring/distance into a server-only module so nothing geo-related ships at all.

**P3 — No next-round prefetch.** Every round pays full Mapillary dart-throw latency (multiple ~1s round-trips) plus a multi-MB image download with a blank screen. Prefetching the next panorama during the result dialog would hide nearly all of it.

**P4 — Empty `next.config.mjs`.** No `images` config, no cache headers, no `compiler.removeConsole` for production.

**P5 — `console.log` in hot paths.** `PanoramaViewer.js` logs on every render and every lifecycle event; `lib/mapillary.js` logs per round. Strip in production builds.

---

## Findings — Correctness & Risk

**R1 — Mapillary bbox constraint (2026).** Search results report a January 2026 change requiring `/images` bbox queries to be **smaller than 0.01 degrees square**. Current `mapillaryDelta` values produce a window side of `2 × delta`:
- `HN: 0.003` → 0.006° — safe
- `TPHCM / DN / DL / DH: 0.005` → **exactly 0.010°** — at or over the stated boundary

I could **not** confirm this in the Mapillary FAQ page I fetched — treat it as a lead, not a fact. Verify with a live probe against `/api/debug/mapillary` before changing anything; if real, drop those deltas to `0.004` (0.008° window) and raise `MAX_EMPTY_WINDOWS` to compensate for the smaller search area.

**R2 — Error path returns a dead screen.** When all rounds fail, players get an `alert()` and no retry (see M6).

**R3 — Result map is a hand-rolled duplicate.** ~100 lines in `GameClient.js` (leaflet import, icon patching, tile layer, markers, fitBounds) duplicate `LeafletMap.js`, and depend on `setTimeout(300)` + a 10-attempt ref-polling retry + two `invalidateSize()` timers. Fragile and DRY-violating. Extract a `ResultMap` component.

**R4 — `PanoramaViewer` writes `innerHTML` with a hardcoded `id="pano"`** then `document.getElementById("pano")`. Works only because one viewer exists at a time. Use a ref-held child div.

**R5 — `LeafletMap` effect deps churn.** Effect deps `[bbox, center, zoom]` with a cleanup that destroys the map; `center` changes once via `setMapCenter` on init, so the map is built, destroyed and rebuilt on load. Wasteful, and any placed marker would be lost. Init once; drive view changes from the second effect only.

**R6 — No tests, no CI.** Scoring (`lib/game.js`), leaderboard ranking (`lib/leaderboard.js`) and session lifecycle (`lib/session.js`) are pure-ish logic guarding the anti-cheat model and are trivially unit-testable. Nothing verifies them today.

**R7 — Version drift.** `eslint-config-next@15.4.6` vs `next@15.5.18`. `next lint` is deprecated (removed in Next 16).

---

## Findings — Code Quality / DX

- `GameClient.js` is 572 lines holding: routing, fetch orchestration, 18 `useState`, imperative Leaflet, and all result UI. Splitting out `ResultMap` and a `useGameRound` hook would cut it roughly in half with no behaviour change.
- Six `useState` calls track leaderboard ranks that always arrive together in one response — one `roundResult` object would do.
- `src/app/components/` and `src/components/ui/` are two component roots. Intentional (app vs shadcn) but worth documenting in `docs/project-structure.md`.

---

## Comparative Analysis

**Imagery source**

| Option | Cost | VN coverage | Verdict |
|---|---|---|---|
| Mapillary (current) | Free, CC BY-SA | Good in HCMC/HN, thin elsewhere | Keep as primary |
| KartaView | Free, CC BY-SA | Sparse in VN | Optional fallback only |
| Google Street View Static | ~$0.007–0.0056/pano, 30k QPM | Best | Disqualified on cost for a free game |

**Map library**

| Option | Mobile touch | Bundle | Verdict |
|---|---|---|---|
| Leaflet (current) | Best out-of-box | Smallest | **Keep** |
| MapLibre GL JS | Good, WebGL, more battery | Larger | Only if vector styling becomes a goal; competes with PSV for GPU |

**360 viewer**

| Option | Gestures | Gyroscope | Size | Verdict |
|---|---|---|---|---|
| Photo Sphere Viewer 5 (current) | Best | Plugin available | Larger (three.js) | **Keep**, enable gyroscope |
| Pannellum | Limited | Weak | 21KB | Rejected — gestures are the product |

---

## Recommendations (ranked)

### Tier 1 — Mobile playability (do first, small diffs, large effect)
1. `touchmoveTwoFingers: false` in `PanoramaViewer.js`. *(M1, one line)*
2. Non-scrolling mobile game screen: `h-dvh overflow-hidden`, panorama fills it, guess map becomes an expandable overlay/bottom sheet; drop `min-h-[400px]`. *(M2, M3)*
3. Serve `thumb_2048_url` instead of `thumb_original_url`. *(P1)*
4. `viewportFit: 'cover'` + safe-area padding on action rows. *(M4)*
5. Scrollable result dialog with pinned footer. *(M7)*

### Tier 2 — Performance & weight
6. Drop `@turf/turf` for `@turf/distance` or inline haversine. *(P2)*
7. Prefetch the next round's panorama during the result dialog. *(P3)*
8. `compiler.removeConsole` in production + strip render-path logs. *(P4, P5)*

### Tier 3 — Robustness
9. Verify R1 with a live Mapillary probe; adjust deltas only if confirmed.
10. Replace `alert()` with an in-app error + Retry state. *(M6, R2)*
11. Extract `ResultMap`; fix `LeafletMap` init churn; ref instead of `innerHTML` in `PanoramaViewer`. *(R3, R4, R5)*
12. Add a test runner (Vitest) + unit tests for scoring/leaderboard/session; add a lint+test CI workflow; migrate off deprecated `next lint`. *(R6, R7)*

### Tier 4 — Delight (optional, mobile-focused)
13. PSV gyroscope plugin — turn the phone to look around. *(M5)*
14. PWA manifest + icons + app-shell service worker; no offline gameplay. *(M8)*

---

## Proposed Mobile Layout

```
   collapsed state                              expanded state
┌──────────────────────────┐              ┌──────────────────────────┐
│ ← Back   [HCMC]      ☕  │              │ ← Back   [HCMC]      ☕  │
│                          │              │                          │
│                          │              │   ┌──────────────────┐   │
│    PANORAMA (fills)      │              │   │                  │   │
│    1-finger = look       │  tap map ──> │   │    GUESS MAP     │   │
│    pinch    = zoom       │              │   │   near-fullscreen│   │
│    tilt     = gyroscope  │              │   │                  │   │
│                ┌───────┐ │              │   └──────────────────┘   │
│                │ mini  │ │              │  [ Submit Guess ]  [ X ] │
│                │  map  │ │              │                          │
├────────────────┴───────┴─┤              ├──────────────────────────┤
│ [ Submit Guess ] [ Skip ]│ safe-area    │  safe-area padded        │
└──────────────────────────┘              └──────────────────────────┘
     h-dvh, no page scroll
```

Desktop keeps the existing `lg:grid-cols-2` side-by-side layout unchanged.

---

## References

- [Mapillary API documentation](https://www.mapillary.com/developer/api-documentation) · [FAQ](https://www.mapillary.com/developer/api-documentation/faq) · [rate-limit forum thread](https://forum.mapillary.com/t/hitting-request-limit/5820)
- [KartaView](https://kartaview.org/) · [KartaView on GitHub](https://github.com/kartaview)
- [Street View Static API usage & billing](https://developers.google.com/maps/documentation/streetview/usage-and-billing) · [Google Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [MapLibre GL vs Leaflet (Jawg)](https://blog.jawg.io/maplibre-gl-vs-leaflet-choosing-the-right-tool-for-your-interactive-map/) · [Map library comparison (Geoapify)](https://www.geoapify.com/map-libraries-comparison-leaflet-vs-maplibre-gl-vs-openlayers-trends-and-statistics/) · [Self-hosted mapping libs compared](https://www.pistack.xyz/posts/2026-06-15-self-hosted-web-mapping-libraries-leaflet-openlayers-maplibre/)
- [Photo Sphere Viewer docs](https://photo-sphere-viewer.js.org/) · [PSV production deep-dive](https://edvaldoguimaraes.com.br/2025/08/26/photo-sphere-viewer-psv-deep-dive-building-production-grade-360-experiences-on-the-web/) · [Open-source 360 libs 2026](https://portalzine.de/open-source-virtual-tour-360-panorama-libraries-in-javascript-2026/) · [Pannellum overview](https://pannellum.org/documentation/overview/)
- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) · [PWA mobile testing checklist 2026](https://mobileviewer.github.io/pwa-mobile-testing-checklist-2026)
- [GeoGuessr guess-map UX history (HN)](https://news.ycombinator.com/item?id=6326074)

---

## Unresolved Questions

1. **Mapillary bbox limit** — is the "smaller than 0.01°" constraint real and enforced? Unconfirmed in official docs; needs a live probe. Four of five cities sit exactly on the stated boundary.
2. **Actual mobile traffic share** — Vercel Analytics is installed. What fraction of sessions are mobile, and what is current p75 round-load time? That determines how hard to push Tier 1 vs Tier 3.
3. **Mapillary `thumb_2048_url` availability** — is it populated for all VN panoramas, or do some images only expose `thumb_original_url`? Needs a field check before switching.
4. **Gyroscope permission UX** — iOS requires a user gesture for `DeviceOrientation`. Where should the opt-in live?
5. **Is the desktop layout allowed to change?** Recommendations keep it as-is; confirm that is intended.
