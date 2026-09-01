---
title: "Geoapify tile migration"
description: "Move the three Leaflet maps off tile.openstreetmap.org to Geoapify (free tier, commercial use allowed), with an OSM fallback when no key is set"
status: completed
priority: P1
effort: "2h"
tags: [licensing, maps]
created: 2026-09-01
---

# Geoapify tile migration

## Overview

Applies the tile-provider research
([report](../reports/research-260901-0843-tile-provider-options.md)): the OSM
public tile server's usage policy prohibits commercial apps, and the game plans
to move from donation-only to ad-supported. Geoapify's free tier explicitly
permits commercial use (3,000 credits/day) with a raster URL that drops into
Leaflet unchanged. All three maps currently hardcode the OSM URL + attribution;
this plan extracts one shared client-safe tile config and swaps the provider,
falling back to OSM when no API key is configured so dev, e2e, and forks keep
working with zero setup.

Out of scope (manual, user-owned): creating the Geoapify account/API key,
setting the Vercel env var, and emailing support@mapillary.com for written
ads confirmation (per
[Mapillary ToU report](../reports/researcher-260901-0843-mapillary-tou-verification.md)).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | All three maps read their tile URL + attribution from one shared module | P1 |
| 2 | Geoapify serves tiles when `NEXT_PUBLIC_GEOAPIFY_KEY` is set; OSM otherwise | P1 |
| 3 | Attribution and `/credits` correctly reflect whichever provider is active | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Shared tile config and provider swap](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Attribution, docs, and verification](./phase-02-attribution-docs-and-verification.md) | Completed |

## Success Criteria

- [x] No component hardcodes a tile URL; `src/lib/map-tiles.js` is the single source
- [x] With a key set, tiles load from `maps.geoapify.com` and attribution shows "Powered by Geoapify"
- [x] Without a key, behavior is byte-identical to today (OSM tiles, OSM attribution)
- [x] `npm run lint`, `npm run build`, and `npm run test:e2e` pass with no key set
- [x] `/credits` and `docs/` describe the tile setup accurately

<!-- slug: geoapify-tile-migration -->
