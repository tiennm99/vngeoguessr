---
title: Guess map search
date: 2026-08-30
summary: "Player-feedback feature: search districts/streets on the guess map. Offline region matching (diacritic folding, quan/q7 aliases) over the client-safe REGIONS tree + Photon geocoder bounded to the played region bbox; selection pans only, never places the guess. Photon over Nominatim (public Nominatim forbids autocomplete). Review fixes: moved Leaflet zoom control via new zoomPosition prop (search box occluded it), 5s AbortSignal.timeout on Photon (hung connection never surfaced the unavailable row), stale-places reset per debounce, reused ui/Input, 44px touch targets, onReady(null) on map teardown. Gotcha: emitting \u-escapes through JSON tool args turns them into literal combining chars; wrote the regex via String.fromCharCode. 274/274 tests, lint+build clean. Plan: plans/260830-2055-map-search."
---

# Guess map search

Player-feedback feature: search districts/streets on the guess map. Offline region matching (diacritic folding, quan/q7 aliases) over the client-safe REGIONS tree + Photon geocoder bounded to the played region bbox; selection pans only, never places the guess. Photon over Nominatim (public Nominatim forbids autocomplete). Review fixes: moved Leaflet zoom control via new zoomPosition prop (search box occluded it), 5s AbortSignal.timeout on Photon (hung connection never surfaced the unavailable row), stale-places reset per debounce, reused ui/Input, 44px touch targets, onReady(null) on map teardown. Gotcha: emitting \u-escapes through JSON tool args turns them into literal combining chars; wrote the regex via String.fromCharCode. 274/274 tests, lint+build clean. Plan: plans/260830-2055-map-search.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
