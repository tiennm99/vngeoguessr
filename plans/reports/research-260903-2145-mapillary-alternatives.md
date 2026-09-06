# Research: Street-level imagery alternatives to Mapillary (Vietnam)

Date: 2026-09-03 · Status: research only, no code changed

## Verdict

**KartaView (GrabMaps) is the only drop-in alternative with real 360° coverage of
Vietnam, an open license, and a keyless public API.** Probed live and confirmed
end-to-end. Google Street View has the best coverage by far and is not blocked by
the terms — it is blocked by price ($14/1000 panorama loads past 5,000/mo) and by
VN credit-card-only GCP billing.

## 1. KartaView — recommended

Formerly OpenStreetCam; owned by GrabMaps since Dec 2019, which is why SEA/Vietnam
coverage is strong. Imagery is CC-BY-SA-4.0, commercial use allowed with attribution
+ share-alike.

Live probe, `POST /1.0/list/nearby-photos/` radius 3 km, 2026-09-03:

| City | items returned | `projection=SPHERE` (360°) | newest shot |
|---|---|---|---|
| Ha Noi (Hoan Kiem) | 919 | 276 | 2025-04-03 |
| TP HCM (D1) | 1000 (page cap) | 341 | 2026-05-13 |
| Da Nang | 159 | 158 | 2026-07-25 |
| Hai Phong | 1000 (page cap) | 290 | 2025-05-29 |
| Can Tho | 1000 (page cap) | 1000 | 2025-06-29 |
| Hue | 425 | 226 | 2025-05-01 |
| Nha Trang | 193 | 192 | 2024-06-25 |
| Buon Ma Thuot | 156 | 156 | 2025-07-10 |

Working endpoints (no token, no auth header):

- Nearby: `POST https://api.openstreetcam.org/1.0/list/nearby-photos/`
  body `lat=&lng=&radius=` → `currentPageItems[]` with
  `id, sequence_id, lat, lng, field_of_view, projection, name, shot_date, heading`.
- By sequence: `GET https://api.openstreetcam.org/2.0/photo/?sequenceId=<id>` → 200.
- Image bytes: `name` is `storage13/files/photo/…jpg`; the fetchable host is
  **`https://storage<N>.openstreetcam.org/<path-after-storageN>`**.
  Verified: 2.9 MB `image/jpeg` equirectangular, HTTP 200.
  `storage<N>.kartaview.org` does **not** resolve — use the `openstreetcam.org` host.
- `2.0/sequence/` and `2.0/photo/?bbTopLeft=…` return `400 Restricted access!` —
  bbox search needs an account key; sequence-scoped and nearby queries do not.

### Coverage measured against the current index, same grid

Raw image counts mislead here. The Mapillary index holds 424,617 panoramas for
Vietnam but is thinned at 33 m, so those collapse to only **2,216 distinct ~1.1 km
cells** (`src/data/regions/counts.js`). What matters is whether a random spot has
imagery, not how many frames exist.

Probed a 0.02° (~2.2 km) grid over Ha Noi and TP HCM, asking both sources the same
question — "is there a usable panorama within 1000 m of this point?" — Mapillary
answered from the local index, KartaView from its live API:

| grid | points | Mapillary | KartaView 360° | both | KartaView-only | Mapillary-only |
|---|---|---|---|---|---|---|
| Ha Noi | 130 | 122 (93.8%) | 111 (85.4%) | 107 | 4 | 15 |
| TP HCM | 195 | 156 (80.0%) | 150 (76.9%) | 140 | 10 | 16 |

So KartaView reaches ~85% / ~77% of the same ground versus Mapillary's ~94% / ~80%,
and covers 14 grid points Mapillary misses. Fewer images, comparable places.

Fit with this repo: filter `projection === 'SPHERE'` (or `field_of_view === '360'`),
which maps onto the existing `is_pano` concept. The prebuilt-index architecture in
`src/lib/pano-index.js` transfers unchanged — index build shifts from Mapillary
graph IDs to KartaView photo IDs + storage paths, and `src/lib/mapillary.js`
becomes a KartaView by-ID/by-sequence lookup. No secret to manage (drop
`MAPILLARY_ACCESS_TOKEN`).

Open risks: hot-linking `storage*.openstreetcam.org` has no documented rate limit or
CDN guarantee; the storage host differs from the brand domain and could change.
Mitigation is the same pattern already used — resolve at request time from a
locally-indexed ID, or proxy/cache thumbnails server-side.

## 2. Panoramax — rejected for this use case

Open (CC-BY-SA-4.0), STAC API, `GET /api/search?bbox=&limit=` works reliably from
here — notably it does *not* exhibit Mapillary's HTTP 500 on dense-bbox search.
But the Vietnam data is the wrong shape: a 1000-feature sample over the whole
country bbox contained **zero** 360° images — 345 flat photos with 18–108° FOV and
655 with no FOV metadata, largely `geovisio:producer: mapcomplete` POI snapshots.
No Vietnam instance exists in the federation. Useful as a future second source or
as self-hosted infrastructure; not a panorama source for Vietnam today.

## 3. Google Street View — cost is the real wall, not the terms

Coverage is by far the best (nationwide, high density). Correction to an earlier
framing: **the Maps Platform ToS contains no prohibition on games or contests** —
searched the full current text for "contest", "sweepstake", "gambl": zero hits. The
blockers are these, in order of how hard they bite:

1. **Cost at scale — structural.** The $200/month universal credit ended 2025-03-01,
   replaced by per-SKU free tiers. The SKU a GeoGuessr clone needs is **Dynamic
   Street View** (the JS panorama viewer): **Pro tier, 5,000 free calls/mo, then
   $14.00/1000**. One panorama load = one call, so at 5 rounds/game:

   | games/mo | calls | monthly bill |
   |---|---|---|
   | 1,000 | 5,000 | $0 (free tier) |
   | 5,000 | 25,000 | ~$280 |
   | 10,000 | 50,000 | ~$630 |
   | 50,000 | 250,000 | ~$3,010 |

   Static Street View is cheaper (Essentials, 10,000 free then $7.00/1000) but
   returns flat 2D images, not a draggable panorama — wrong product for the game.
   Street View Metadata is free and unlimited. A donation-funded project cannot
   absorb the Dynamic tier past ~1,000 games/month.
2. **Payment — practical.** GCP self-serve billing in Vietnam is credit-card only;
   VN-issued debit cards are reported rejected. Requires a real credit card or a
   virtual-card workaround, i.e. exactly the wall you remembered.
3. **Architecture — surmountable but invasive.** ToS 3.2.3(a) "No Scraping" forbids
   pre-fetching, indexing, storing, resharing or rehosting Google Maps Content, and
   explicitly names "bulk download [of] Street View images". The Street View policies
   page exempts the **panorama ID** from the caching restriction, so a prebuilt ID
   index like `pano-index.js` is defensible — but imagery must render through
   Google's own `StreetViewPanorama` with Google Maps attribution visible. That
   retires `PanoramaViewer.js`, and location-leaking chrome (address control, links,
   road labels) must be suppressed via viewer options rather than by owning the
   renderer.

## 4. Also checked, not viable

- **Vietnamese vendors.** Map4D (IOTLink) markets a Vietnam 360 street-view layer
  but publishes no self-serve panorama API or price — sales contact required.
  VietMap sells tiles/geocoding/routing (50 VND per transaction, 60k free/mo trial)
  with **no panorama product** in its docs. `openmap.vn` now redirects to
  `ndamaps.vn`; `api.openmap.vn` returns 403. All three are enquiry-gated, so none
  can be evaluated without a commercial conversation — but Map4D is the one worth
  emailing if a licensed VN-only source becomes desirable.
- **Apple Look Around, Bing Streetside, Yandex Panoramas** — no public imagery API,
  and/or no Vietnam coverage.
- **Self-hosted (Panoramax server, `tjhorner/streetlens`)** — solves hosting, not
  the missing Vietnam imagery. Only relevant if capturing imagery yourself.

## Recommendation

Keep Mapillary as the primary index and add KartaView as a second source rather than
a replacement: same index architecture, no token, more recent Vietnamese imagery in
several cities (Da Nang 2026-07, HCMC 2026-05), and its nearby/sequence queries do
not suffer the dense-bbox failure documented in `src/lib/mapillary.js`. Adding it
also removes the single-provider dependency without touching the scoring, session,
or district logic. Credits page needs a CC-BY-SA-4.0 attribution line for KartaView
if adopted.

## Unresolved questions

- Is hot-linking `storage*.openstreetcam.org` acceptable at game traffic volumes, or
  should images be proxied? No published rate limit found.
- Does CC-BY-SA-4.0 share-alike create any obligation given imagery is displayed
  unmodified? (Displaying is not adapting, so likely attribution-only — worth a
  second look before shipping ads, per the monetization constraint.)
- Is the `2.0/photo/?bbTopLeft=` bbox search worth requesting an account key for, to
  make index-building cheaper than sequence-walking?
