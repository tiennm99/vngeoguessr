# Research Report: Free Street-Level Imagery Alternatives to Mapillary (Vietnam)

Conducted 2026-08-29. All coverage numbers below are live API probes run that day, not vendor claims.

## Executive Summary

**No better free alternative exists.** Stay on Mapillary. Every candidate that is free and API-accessible fails the one requirement this game cannot compromise on: equirectangular 360° panoramas in Vietnamese cities. KartaView and Panoramax both have open, fast, keyless APIs and real Vietnam data — but effectively zero usable panoramas. Google Street View has the coverage and is blocked by billing, as stated.

**The actual win is not a provider switch.** It is dropping Mapillary's Graph *search* API for its *vector tile* API. Current cost is up to 20 bbox searches at ~1-5s each; the tile path is one CDN request plus one entity lookup. That attacks the same latency the dart-throw rework already halved, and goes further, without changing imagery source, licensing, or coverage.

Caveat up front: the tile path is documented but **not empirically verified** here — `MAPILLARY_ACCESS_TOKEN` is not available in this environment (env pull blocked). Everything else in this report is measured.

## Methodology

- 4 web searches, 1 doc fetch, ~12 direct API probes against KartaView, Panoramax, and image CDNs.
- Coverage measured by querying each API at the centre of TPHCM, HN, DL, DN and counting panorama-flagged records.
- Panorama claims verified by downloading actual JPEGs and reading dimensions from the SOF header — vendor `field_of_view` metadata was **not** trusted, and that scepticism proved necessary.

## Candidate Evaluation

| Provider | API free? | Key needed? | VN coverage | Usable 360°? | Verdict |
|---|---|---|---|---|---|
| **Mapillary** (current) | yes | yes | good | **yes** | **keep** |
| KartaView | yes | **no** | thin | **no** | reject |
| Panoramax | yes | **no** | thin | **no** | reject |
| Google Street View | free tier, billing required | yes | best | yes | blocked (billing) |
| Bing Streetside | — | — | — | — | platform retiring |
| Yandex / Apple / Naver / Kakao | no public API | — | none | — | reject |

### KartaView — closest call, still fails

Genuinely attractive on paper: `POST https://api.kartaview.org/1.0/list/nearby-photos/` needs **no API key**, and answered in **0.05-0.30s** (vs Mapillary's 1-5s). Grab-backed, so Southeast Asia is a focus, and it markets "3 Cities in Southeast Asia, in full 360º Imagery".

Measured reality, 300m radius at each city centre:

| City | photos | `projection: SPHERE` |
|---|---|---|
| TPHCM | 893 | 13 |
| HN | 49 | 0 |
| DL | 1 | 0 |
| DN | 0 | 0 |

Worse, the 13 HCMC SPHERE records are mislabelled. All 6 sampled carry `field_of_view: 360` and `projection: SPHERE`, but the served JPEG is **2560×1440 (16:9)** — a flat frame, not a 2:1 equirectangular pano. PhotoSphere Viewer would render it as a distorted band. Outside HCMC there is no meaningful density at all.

Image CDN, for the record: `name` is prefixed `storage13/`; canonical URL is `https://kartaview.org/<name>`, 301-ing to `https://storage13.openstreetcam.org/files/...`. Variants `proc` (2.4 MB), `lth` (341 KB), `th`.

### Panoramax — open and well-built, wrong geography

STAC API, no key, fast: `GET https://api.panoramax.xyz/api/search?bbox=minLng,minLat,maxLng,maxLat`. Federated, IGN + OSM-France backed, CC-BY-SA.

Vietnam data exists but is entirely narrow-FOV phone photography:

| Scope | images sampled | `field_of_view` values | 360° |
|---|---|---|---|
| TPHCM | 120 | absent | 0 |
| HN | 200 | 72° | 0 |
| Vietnam-wide | 200 | 18°-108° | 0 |

526 Vietnam images sampled, zero panoramas. Coverage is France-centric by design; the Taiwan and Wales instances show the federation model working, but nobody is running a Vietnam instance.

### Google Street View

Best Vietnam coverage by far, and the Street View Static API does have a free monthly tier. But it still requires an enabled Google Cloud **billing account**, which is the stated blocker. Not routable around without a foreign card or reseller — out of scope for this report.

## Recommendation: switch Mapillary access pattern, not provider

Current `fetchMapillaryImages` searches a random 1km window and re-rolls on a miss. Each miss is a full Graph *search* round-trip (~1-5s). The concurrent-round rework cut p50 from 17.8s to ~4s, but the ceiling is still bounded by search latency.

Mapillary serves the same coverage as vector tiles from a CDN. The `image` layer at **zoom 14** carries `id` and `is_pano` per point — exactly the two fields the dart-throw is hunting for.

```
current:  up to 20 × graph search  (~1-5s each)     → p50 ~4s
proposed: 1 × tile fetch (CDN)  +  1 × entity lookup → est. ~300-800ms
```

Sketch:

1. Compute the z14 tile range covering the city bbox (a z14 tile is ~2.4km; TPHCM ≈ 36 tiles).
2. Pick a random tile, fetch
   `https://tiles.mapillary.com/maps/vtp/mly1_public/2/14/{x}/{y}?access_token=…`
3. Decode MVT, take the `image` layer, filter `is_pano === true`.
4. Random pick → gives `id` **and** point geometry (so no coordinate lookup needed).
5. One entity call for the image URL:
   `https://graph.mapillary.com/{id}?fields=thumb_original_url`

Why this beats the dart-throw: a z14 urban tile holds hundreds of image points, so "does this window contain a pano" stops being a coin flip. Misses become rare instead of typical.

**Costs and caveats:**

- Two new deps to decode MVT: `@mapbox/vector-tile` + `pbf`. Both small, pure JS, no native build.
- **Tile API rate limit is 50,000/day — not per minute.** Graph is 60k/min. This is far tighter and is the main risk. Mitigation: cache decoded tiles in the existing Upstash (they change slowly), which also drops most game starts to a single entity lookup.
- Empty/ocean tiles still need a re-roll, so keep a bounded retry loop.

## Also worth doing regardless

Da Lat returned `success: false` during yesterday's verification, and Ha Noi's p90 is still ~17s. Both are hit-rate problems, not latency problems — HN uses the smallest window (`mapillaryDelta: 0.003`). Widening deltas is a cheaper experiment than any of the above and is independent of it.

## Unresolved questions

1. **Tile path unverified.** No `MAPILLARY_ACCESS_TOKEN` in this environment, so steps 2-5 above are documentation-based. Needs one probe against a real token before committing to it.
2. **50k/day tile ceiling** — is that per app or per token? Docs say "limited to 50,000 per day"; unclear whether caching alone keeps a popular deployment under it.
3. **Pano density per z14 tile in VN cities** unmeasured — determines whether the retry loop can shrink to 2-3 attempts or stays near current size.
4. Whether Google Cloud billing is genuinely unreachable, or reachable via a foreign card — would change the recommendation outright, since Street View coverage dwarfs Mapillary's in Vietnam.

## Sources

- [KartaView](https://kartaview.org/) · [KartaView GitHub](https://github.com/kartaview) · [SEA 360° imagery](https://kartaview.org/landing/open-imagery)
- [Panoramax](https://www.panoramax.xyz/en/instances) · [Panoramax API](https://api.panoramax.xyz/) · [Wikipedia](https://en.wikipedia.org/wiki/Panoramax)
- [Mapillary API documentation](https://www.mapillary.com/developer/api-documentation) · [API v4 getting started](https://blog.mapillary.com/update/2021/06/23/getting-started-with-the-new-mapillary-api-v4.html)
- [Google Street View alternatives 2026](https://topalter.com/best-google-street-view-alternatives/free)
