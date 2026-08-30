# Game Features

## Location Coverage
- **Three-level region tree**: Vietnam → five provinces → 61 districts and towns,
  generated into `src/data/regions/` and traversed through `src/lib/regions.js`
- **Play at any level**: the whole country, one province, or one district
- **Pre-2025-merger boundaries**: Da Lat sits under Lam Dong, Duc Hoa under Long An
- **Partial by design**: see the Coverage note in [project-overview.md](project-overview.md)
  for the three distinct reasons a region can be unavailable

## Street View System
- **Prebuilt panorama indexes**: each province ships a list of Mapillary panorama
  ids, their coordinates, and the district each falls in, built offline by
  `scripts/build-pano-index.mjs` and `scripts/assign-pano-districts.mjs`
- **Mapillary vector tiles**: the index is built from the z14 `image` layer, not
  from `/images?bbox=` search, which returns HTTP 500 in exactly the dense
  districts the game wants to play. See the header of `src/lib/mapillary.js`
- **Runtime cost is one lookup**: `fetchPanoramaById` resolves a chosen id in
  ~230ms; a couple of alternates are tried in case an image was deleted upstream
- **Country draws pick a province first**, uniformly, so Vietnam rounds are not
  97% Ha Noi and Ho Chi Minh by panorama count
- **Panoramas only**: non-panoramic images are filtered out when the index is
  built, so every indexed point is a panorama. The flag itself is not stored
- **Thumbnail display**: `thumb_2048_url`, falling back to `thumb_original_url`

## Interactive Maps
- **Leaflet Integration**: OpenStreetMap-based interactive mapping
- **Click-to-Place**: Intuitive guess marker placement

## Anti-Cheat Security
- **Redis Session Management**: target coordinates stored server-side in Redis
- **Server-resolved region**: the district a panorama sits in is decided at
  session creation and never sent to the client; a `regionCode` in the guess
  request body is ignored
- **UUID Session IDs**: unique session identifiers using uuid v4
- **30-minute Expiry**: automatic Redis session cleanup
- **Single-use sessions**: the session is claimed with an atomic `DEL` before any
  score is written, so a replayed or concurrent submit scores exactly once
- **Server-side Calculations**: all distance and scoring computed server-side
  using Turf.js

## Scoring System
Distance-based points (0-5 scale):
- **0-50m**: 5 points
- **50m-100m**: 4 points
- **100m-200m**: 3 points
- **200m-500m**: 2 points
- **500m-1km**: 1 point
- **1km+**: 0 points

## Leaderboards
- **Rollup fan-out**: one guess credits the district its panorama sat in, then
  that district's province, then Vietnam — three score boards and three
  distance boards. A panorama that fell outside every district outline credits
  two levels instead of three; no province currently has such a panorama
- **Score Leaderboards**: accumulated points, one entry per user per board
- **Distance Leaderboards**: best-distance records, multiple entries per user
- **Existing scores preserved**: Vietnam keeps the pre-existing
  `leaderboard:vietnam` / `distance:vietnam` keys rather than starting a new
  `leaderboard:city:vn`. `HN`, `DN` and `TPHCM` kept their codes, so their boards
  carried over untouched. Only two codes moved — Da Lat's board was backfilled
  into Lam Dong's and Duc Hoa's into Long An's by
  `scripts/migrate-leaderboards.mjs`, which copies rather than moves. No score
  was reset
- **Redis Sorted Sets**: persistent leaderboard data using ZADD/ZRANGE
- **Top 200 Entries**: automatic trimming per leaderboard
- **Real-time Ranking**: rank calculated with ZREVRANK/ZRANK
- **Persistent Storage**: no expiration on leaderboard data

The `leaderboard:city:` / `distance:city:` key prefix is kept deliberately —
renaming it would orphan every score already recorded under it.
