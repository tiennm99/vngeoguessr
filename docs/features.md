# Game Features

## Location Coverage
- **Three-level region tree**: Vietnam → nine provinces → 75 districts and towns,
  generated into `src/data/regions/` and traversed through `src/lib/regions.js`
- **Names shown in Vietnamese**: every province and district carries an
  accented `nameVi` ("Hoàn Kiếm", "Quận 7"), derived by the boundary script
  from its OSM query, and `regionName()` in `src/lib/regions.js` is what the
  interface, the API's `region.name` and the share text show. The ASCII `name`
  stays as the stable form for codes, logs and search aliases; the map search
  matches either spelling. The country stays "Vietnam" in an English
  interface. The font loads the `vietnamese` subset for the glyphs
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
  the player, and is never joined to their username or scores. Its one other
  use is a HyperLogLog of distinct players per day (see Play statistics), which
  can be counted but never read back. It is not the
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
- **Debug API closed in production**: `/api/debug/pano` and
  `/api/debug/region-coverage` return panorama coordinates, which is the answer
  to any live round. On Vercel production they answer only a request carrying
  `DEBUG_ACCESS_KEY` as the `x-debug-key` header or the `vng_debug` cookie
  (`src/lib/debug-access.js`); unset, they are closed. Production means
  Vercel's production environment, or a production build anywhere Vercel's
  variables are absent. Local development, tests and preview deployments keep
  them open. The `/debug` pages still render in production
  but their data calls fail without the key
- **Validated input**: the username rule lives once in `src/lib/username.js`
  (2-20 characters of letters, digits, `-`, `_`, any script) and is enforced by
  the name prompt and by `/api/guess`; a colon is excluded because the distance
  boards pack `username:distance:timestamp` into one member. Guess coordinates
  must be finite numbers, checked before the session is consumed so a malformed
  submit costs nothing. A `sessionId` that is not a UUID is replaced on
  `/api/new-game` and rejected on `/api/skip`; only server-minted ids reach the
  keyspace
- **Server-resolved region**: the district a panorama sits in is decided at
  session creation and never sent to the client; a `regionCode` in the guess
  request body is ignored
- **UUID Session IDs**: unique session identifiers via `crypto.randomUUID()`
- **30-minute Expiry**: automatic Redis session cleanup
- **Single-use sessions**: the session is claimed with an atomic `DEL` before any
  score is written, so a replayed or concurrent submit scores exactly once.
  After the claim the score fan-out settles per level: the levels that wrote
  are returned, `partial: true` marks a level that did not, and only a round
  where no level wrote is reported as unsaved. The failure carries a `reason` (`session-expired`, `session-consumed`,
  `invalid-guess`, `invalid-username`, `invalid-request`) and the result dialog
  words each one differently, so an expired round is not reported as a failed
  write
- **Skipped rounds get a fresh id**: the skip request deletes the old session
  without being awaited, so the next round never reuses that id -- a late
  delete used to land after the new round's write and kill it
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

Below 3 points the dialog adds one display-only line the ladder cannot say:
"Right district", "Right province, wrong district" or "Wrong province". The
server locates the guess against the generated boundaries
(`src/lib/region-locate.js`, server-only) and returns it as `hit` and
`guessedRegion` on `gameResult`. It changes no score. After the reveal the
dialog also links the answer's coordinates to OpenStreetMap -- only after the
guess, never before.

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
- **Redis Sorted Sets**: persistent leaderboard data using ZINCRBY/ZADD/ZRANGE
- **Score boards are never trimmed; the top 200 is a serving window**: a score
  board holds one member per name, so it grows with the player count. It used
  to be trimmed to 200, which deleted the running total of anyone below the
  cut -- their next round restarted from zero, and once 200th place held more
  than one round's points nobody new could ever get on. Distance boards gain a
  member every round and are still trimmed to 200. Scores are added with one
  atomic ZINCRBY, so two rounds under one name finishing together both count
- **Real-time Ranking**: rank calculated with ZREVRANK/ZRANK
- **Persistent Storage**: no expiration on leaderboard data

The `leaderboard:city:` / `distance:city:` key prefix is kept deliberately —
renaming it would orphan every score already recorded under it.

## Daily Challenge
- **One panorama, the same for everyone, once a day** at `/daily`. The pick is
  deterministic from the day (`pickPanoBySeed` in `src/lib/pano-index.js`,
  province first like a country round) and cached in Redis as `daily:{day}`
  for 48 hours, so the Postgres draw happens once a day. The image URL is
  resolved from Mapillary on every request, as every round does, so a signed
  URL that stops working never breaks the day; a pick deleted upstream is
  forgotten and the next seeded candidate takes over
- **Days roll over at midnight Vietnam time** (`src/lib/daily-calendar.js`),
  numbered from 2026-09-20 as #1
- **Scored, counted, never credited**: `/api/daily` opens an ordinary session
  flagged `mode: 'daily'`; `/api/guess` scores it on the same ladder and counts
  it under its own `daily` level in the statistics, but credits no
  leaderboard. The panorama is the same all day and the answer is in the first
  guess response, so any board the daily fed would be five points for two
  requests, repeatable all day. No skipping; the submit button says "Submit
  final guess" 
- **No daily leaderboard, on purpose**: the only identity is a cookie and a
  localStorage name, so a dated board would be won by whoever opened the most
  private windows. One attempt per day is enforced by the browser alone
  (`src/lib/daily-progress.js`): the finished round is stored with its
  panorama, pin and result, and reopening `/daily` shows that instead of a
  second attempt. Clearing storage means playing again; since the daily feeds
  no board, that only cheats the player
- **Streak**: consecutive days played, kept in the same record. The day after
  the last play extends it, the same day keeps it, a gap restarts it. Shown in
  the game header, the result dialog, the share text and the home page card

## Sharing
- **Daily share text**: `VNGeoGuessr Daily #N`, the squares line, and the
  streak once it is above one, linking to `/daily`
- **Share button on the result dialog**: builds three lines -- the picked
  region, the score as five squares with the distance, and the region's
  `/game/{slug}` URL (`src/lib/share.js`) -- and hands them to the platform
  share sheet, or the clipboard where there is none. Never coordinates, the
  panorama id or the resolved district: the same panorama can be dealt again
- **Link previews**: the root layout and every region page carry Open Graph
  and Twitter card metadata, so a shared link unfurls with the region's name.
  `metadataBase` comes from `NEXT_PUBLIC_SITE_URL`, else Vercel's production
  URL, else localhost

## Play statistics
- **Two keys per UTC day** (`src/lib/stats.js`): `stats:{day}` is a hash of
  round counts keyed `{pickedLevel}:{score}`; `stats:players:{day}` is a
  HyperLogLog of `vng_pid` values. Together they give rounds/day, distinct
  players, rounds per player, the zero-score share per level, and a return
  rate from the union of several days against their sum. Both expire after 90
  days. Nothing per player is stored; the HyperLogLog only counts
- **Cost**: two Redis commands per round, plus an EXPIRE on the hash for each
  new field of the day and one on the HyperLogLog for each new player. A
  failed write is logged and never fails the guess
- **Reading them**: `npm run stats [days]` prints the last N days
