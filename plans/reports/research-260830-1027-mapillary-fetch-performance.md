# Research: why Mapillary image fetching is slow, and how to fix it

Conducted 2026-08-30. Method: live probes against the Graph API and the tile API using the project token, plus doc/forum research. All numbers below are measured on this machine, not estimated.

## Executive summary

The slowness is not the dart-throw missing empty windows. It is that **`GET /images?bbox=` fails or crawls in exactly the places the game wants to play**. Measured:

- In the two densest city cores (HCMC District 1, Ha Noi centre) the endpoint returns **HTTP 500 in ~4-5s**, whatever the window size and whatever `limit` is set to. `limit=1` on a 0.002 deg window fails identically to `limit=50`.
- Where it succeeds, it still takes **1.1-6.6s**.
- Empty windows answer fast (~180ms), so the current code is quickest precisely when it finds nothing.
- In one 40-window sample: **6 hits, 1 empty, 33 errors**. The retry budget in `lib/mapillary.js` is tuned for empty windows, but the dominant failure is errors.

The fix is to stop asking the Graph API "what is near here". A **by-ID lookup measured 219-379ms (median 230ms) and never failed**, including for images inside District 1. So the runtime path should be: pick an image id we already know about, then one by-ID call.

That is the user's own suggestion (prebuild a per-city index), and the probes support it. The right source for the index is the **vector tile API**, which returned 200 for every tile tested, including the cores where `/images` 500s.

---

## Measurements

### 1. The 500 is about image density, not query size

Identical 0.002 deg window, only the location changing:

| Location | Result |
|---|---|
| HCMC District 1 core | **500** in 4276ms |
| Ha Noi core | **500** in 5294ms |
| District 3 | 200 in 4690ms, 4 imgs |
| Binh Thanh | 200 in 6613ms, 5 imgs (3 pano) |
| District 7 | 200 in 3778ms, 4 imgs |
| Thu Duc east | 200 in 186ms, 0 imgs |
| SW edge of bbox | 200 in 1103ms, 1 img |
| Da Lat | 200 in 2010ms, 1 img |
| Duc Hoa (rural) | 200 in 176ms, 0 imgs |

The error text is `Please reduce the amount of data you're asking for`. That is literally accurate but misleading: it refers to how many images exist inside the window, not to the window's dimensions or the `limit` parameter. Mapillary appears to count before it limits, which is why `limit=1` does not help.

Corroboration: Mapillary's own forum carries an open thread, [Consistent HTTP 500 Errors on Graph API since Nov 7](https://forum.mapillary.com/t/consistent-http-500-errors-on-graph-api-images-and-map-features-endpoints-since-nov-7/10077), reporting 500s on small bboxes, plus a [Query Timeout](https://forum.mapillary.com/t/query-timeout-mapillary-api-error/9754) thread. This is a platform condition, not a bug in our code.

### 2. The documented bbox limit does not save us

The January 2026 constraint (`bbox` must be under 0.01 deg square) is real, and `CITIES` currently uses `mapillaryDelta: 0.005` for four of five cities, producing a window of exactly 0.010 deg — on the boundary. But shrinking it does not fix anything: **0.0004 deg windows still 500 in the cores.** Tightening the delta addresses a constraint that is not the binding one.

### 3. Repeats are deterministic, so it is not throttling

The same request 8x in a row: 0/8 succeeded. A 90-second cooldown before a single request: still 500. A burst of 8 concurrent after a 45s pause: 0/8. Whatever this is, backing off does not clear it, so the existing `ERROR_BACKOFF_MS` escalation buys nothing.

### 4. By-ID lookup is fast and reliable

`GET /{image_id}?fields=id,thumb_2048_url,geometry,is_pano`, 8 samples:

```
219, 220, 224, 225, 230, 256, 311, 379 ms   -> median 230ms, 0 failures
```

This is the call a prebuilt index reduces the runtime to. Roughly **20-50x faster** than the current path, and it does not degrade in dense areas.

### 5. Vector tiles work where the Graph API does not

`https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}` returned 200 for every tile tried, including District 1.

| Zoom (D1 core) | Size | Time |
|---|---|---|
| z6 | 2240 KB | 2091ms |
| z10 | 1977 KB | 1406ms |
| z12 | 884 KB | 732ms |
| z14 | 8930 KB | 2313ms |

Per the [API docs](https://www.mapillary.com/developer/api-documentation), the `image` layer spans z6-14 and carries `id` and `is_pano` per point — exactly the two fields an index needs. Tiles are Mapbox Vector Tile format, so decoding needs a MVT reader.

z14 tile counts per city bbox: HN 36, TPHCM 42, DL 36, DH 30. At z14 a full HCMC pull is roughly 300 MB — acceptable for a one-off offline build, not for runtime. Lower zooms are far smaller and may carry enough points; worth measuring during implementation before defaulting to z14.

---

## Options

### A. Prebuilt pano index (recommended)

Offline script walks each city's z14 (or lower) tiles, decodes the `image` layer, keeps points where `is_pano` is true, and writes `{id, lat, lng}` per city. Runtime picks a random entry and makes one by-ID call.

- Runtime cost: **one ~230ms request**, no retries, no dart-throw.
- Removes the failure mode entirely: we never ask a bbox question again.
- Guarantees a hit, so "no images found" stops happening.
- Lets us curate: drop images outside the playable area, bias toward street-level coverage, exclude a known-bad sequence.
- Costs: a build step, an MVT decode dependency (`@mapbox/vector-tile` + `pbf`, dev-only), an index artifact to store, and staleness — new Mapillary uploads only appear after a rebuild. For a guessing game, staleness is close to irrelevant.

Where to keep the index: committed JSON per city (simple, versioned, no infra, adds repo weight), or Upstash (already a dependency, easy to refresh without a deploy, one extra Redis read per round). A committed file is simpler and the data barely changes.

### B. Cache successful results in Upstash

Keep the dart-throw but remember windows that worked, and serve from cache most of the time.

- Much smaller change, reuses infrastructure already present.
- But the first player into a cold city still pays the full broken path, and cache misses still hit an endpoint that 500s in the cores. It mitigates the symptom; it does not remove it.
- Reasonable as a complement to A, redundant if A lands.

### C. Keep dart-throwing, just tune it

Lower `mapillaryDelta`, raise the error budget, widen backoff.

- The probes say this fails: 0.0004 deg windows still 500, and backoff does not clear the condition.
- **Not recommended.** This is the current architecture and the measurements are its verdict.

### D. Second imagery source (KartaView) as fallback

Only worth it if coverage, not latency, becomes the constraint. Does not address today's problem.

---

## Recommendation

Option A, with the index committed as per-city JSON. Then delete the dart-throw machinery in `lib/mapillary.js` (the racing, the empty/error budgets, the backoff) — it exists to work around an endpoint we would no longer call.

Suggested shape:

```
scripts/build-pano-index.mjs     # offline, run manually, needs the token
  -> src/data/panos-<city>.json  # [{ id, lat, lng }, ...]

lib/mapillary.js
  pickRandomPano(cityCode)       # random entry from the index
  fetchPanoById(id)              # one Graph call, ~230ms
```

`api/new-game/route.js` keeps its current contract: it still stores the exact location server-side, so the anti-cheat model is untouched. The coordinates now come from the index rather than a bbox response.

---

## Unresolved questions

1. Which zoom gives the best size-to-coverage trade for the index build? z12 was 884 KB vs z14's 8930 KB for the same area; if the `image` layer is adequately populated at z12 the build gets ~10x cheaper. Measure before committing to z14.
2. How many panoramas per city does the index actually yield, and is the spatial spread good enough that rounds do not repeat locations? Needs a build run to answer.
3. Index storage: committed JSON vs Upstash. Depends on the answer to (2) — a few thousand entries is a small file, a few hundred thousand is not.
4. Refresh cadence. Manual re-run is probably fine; worth deciding whether it belongs in CI.
5. Do `thumb_2048_url` values expire? They look signed, which is why the design keeps the by-ID call at runtime rather than baking URLs into the index. Not verified.
6. The current `mapillaryDelta` values sit exactly on the documented 0.01 deg boundary. Irrelevant if Option A lands, but it would need fixing if any bbox query survives.
