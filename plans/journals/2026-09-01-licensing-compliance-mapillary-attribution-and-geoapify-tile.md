---
title: "Licensing compliance: Mapillary attribution and Geoapify tile migration"
date: 2026-09-01
summary: "Added Mapillary attribution overlay + /credits page, centralized tile provider with commercial-safe Geoapify option behind NEXT_PUBLIC_GEOAPIFY_KEY"
---

# Licensing compliance: Mapillary attribution and Geoapify tile migration

## What happened
License review found the code side clean (Apache-2.0 project, all deps permissive) but two data-service gaps: panoramas showed no Mapillary attribution (ToU §11 violation), and all three Leaflet maps hardcoded tile.openstreetmap.org, whose policy bans commercial use — relevant because monetization is planned (donation now, ads later).

Session delivered, in commits bbe5987, a5c9ef5, d7d6eff:
- Mapillary logo + CC BY-SA 4.0 overlay in `src/app/components/PanoramaViewer.js` (homepage link only — the per-image link would leak the round answer), official wordmark saved to `public/mapillary-logo.svg`.
- New `/credits` page (`src/app/credits/page.js`) + home footer attribution line.
- New `src/lib/map-tiles.js`: single tile-provider source — Geoapify (`osm-bright`, free tier explicitly allows commercial use) when `NEXT_PUBLIC_GEOAPIFY_KEY` is set at build time, byte-identical OSM fallback otherwise. Three maps swapped to it.
- Review-gate fixes: `tests/e2e/helpers.js` now stubs `maps.geoapify.com` too (a filled-in local key would have silently sent every e2e run online, spending metered credits); `tests/map-tiles.test.js` pins both provider branches; `docs/project-structure.md` updated.

Verification: 251/251 unit, 10/10 e2e, lint 0 errors, prod build both keyed and keyless (tester agent confirmed key inlines into tile URLs only; credits page text flips per mode).

## Decision
- Stay on OSM tiles while donation-only/low-traffic; Geoapify swap becomes mandatory before ads ship — just set the env var in Vercel, no code change.
- Research verdict (plans/reports/researcher-260901-0843-mapillary-tou-verification.md): donation and ad models plausibly fit Mapillary ToU §12(i), but get written confirmation from support@mapillary.com before launching ads.

## Next steps
- User: create Geoapify account, domain-restrict the key, set `NEXT_PUBLIC_GEOAPIFY_KEY` in Vercel when ready (placeholder comment appended to local .env).
- User: email Mapillary before ads ship.
- Open question: Geoapify credit-per-tile math vs real traffic (3k credits/day budget).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
