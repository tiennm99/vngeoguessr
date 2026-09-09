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
- **No immediate repeats**: the last 50 panoramas a player was shown are
  excluded from their next draw, across every region. A location is recorded as
  seen when the round is created, so skipping one also stops it coming back.
  The exclusion is a preference, not a rule: where it would empty a small
  region's pool it is dropped and a repeat allowed, because a repeat beats
  telling the player a region they can see has no coverage
- **The player identity behind that is a cookie and nothing more**: `vng_pid` is
  an httpOnly UUID the server mints, holds no personal data, is never shown to
  the player, and is never joined to their username or scores. It is not the
  username, deliberately — that lives in localStorage, is renameable, and is
  shared by anyone who types it
- **Panoramas only**: non-panoramic images are filtered out when the index is
  built, so every indexed point is a panorama. The flag itself is not stored
- **Thumbnail display**: `thumb_2048_url`, falling back to `thumb_original_url`
- **Attribution overlay**: every panorama shows the Mapillary logo (linking to
  the Mapillary homepage, never the per-image page — the image id is the
  round's answer) and a CC BY-SA 4.0 link, as the Mapillary Terms of Use
  require. `/credits` lists all data sources and licenses; the home page
  footer links to it

## Interactive Maps
- **Leaflet Integration**: OpenStreetMap-based interactive mapping. Tiles come
  from Geoapify when `NEXT_PUBLIC_GEOAPIFY_KEY` is set at build time (free
  tier allows commercial use), falling back to the OSM public server
  otherwise; the choice is centralized in `src/lib/map-tiles.js`
- **Click-to-Place**: Intuitive guess marker placement
- **Map Search**: search box on the guess map finds districts (offline,
  diacritic- and alias-aware: `quận 7`, `q7`, `hoàn kiếm`) and streets/places
  (Photon geocoder, bounded to the played region). Selecting a result only
  pans/zooms the map — it never places the guess marker

## Anti-Cheat Security
- **Redis Session Management**: target coordinates stored server-side in Redis
- **Server-resolved region**: the district a panorama sits in is decided at
  session creation and never sent to the client; a `regionCode` in the guess
  request body is ignored
- **UUID Session IDs**: unique session identifiers via `crypto.randomUUID()`
- **30-minute Expiry**: automatic Redis session cleanup
- **Single-use sessions**: the session is claimed with an atomic `DEL` before any
  score is written, so a replayed or concurrent submit scores exactly once
- **Server-side Calculations**: all distance and scoring computed server-side
  using Turf.js

## Scoring System
Distance-based points (0-5 scale). One ladder for every region — the size of
the region the player picked does not change a threshold (`SCORE_BANDS` in
`src/lib/game.js`):
- **0-50m**: 5 points
- **50m-100m**: 4 points
- **100m-200m**: 3 points
- **200m-500m**: 2 points
- **500m-1km**: 1 point
- **beyond**: 0 points

A guess is graded on absolute precision, so a point means the same thing on
every board and a country round is only won by pinning the street. The ladder
is shown on the result dialog.

The headline score and the leaderboards agree: every board above the panorama's
district is credited the same points for the round (`submitRoundScore` in
`src/lib/leaderboard.js`). Each level's added points are returned as `points`
on its `gameResult.levels` entry. Scores earned under the earlier region-scaled
ladder stay on the boards as they were recorded.

## Sound & Music
- **Sound effects**: nine one-shots on the play flow — a click when Play or
  Back changes screen, a pop when the guess pin lands, a rising sound on
  submit, a jingle tiered off the score (4-5 points, 1-3, a miss), a transition
  into the next round, a flat blip on skip, and a low tone when the panorama
  viewer fails to start or a guess is not recorded. The click is deliberately
  limited to the two buttons that navigate: on every button in the chrome it
  became noise within a few rounds
- **Background music**: one ambient loop at roughly a third of the effects'
  volume, so it sits under the panorama rather than competing with it. It is
  mounted app-wide rather than per page, which is what lets it play unbroken
  across the menu and a round — and means it also plays on Credits and the
  debug pages
- **Two switches, both on by default**: music and effects toggle independently
  from the header, beside the theme switch, and both choices persist in
  localStorage. The game header collapses them into a single mute-everything
  button below the `sm` breakpoint, where there is no room for the pair
- **Nothing plays before a gesture**: every browser blocks audio until the
  player interacts, so no audio file is even fetched until the first click or
  keypress — which also means music on iOS starts at the first tap, not on load
- **All assets are CC0**: sourced from Kenney and OpenGameArt, with per-file
  provenance in `public/audio/SOURCES.md` and credit on `/credits`

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
  into Lam Dong's and Duc Hoa's into Long An's by a one-shot copy script
  (applied and verified 2026-09-01, then removed; it survives in git history).
  No score was reset
- **Redis Sorted Sets**: persistent leaderboard data using ZADD/ZRANGE
- **Top 200 Entries**: automatic trimming per leaderboard
- **Real-time Ranking**: rank calculated with ZREVRANK/ZRANK
- **Persistent Storage**: no expiration on leaderboard data

The `leaderboard:city:` / `distance:city:` key prefix is kept deliberately —
renaming it would orphan every score already recorded under it.
