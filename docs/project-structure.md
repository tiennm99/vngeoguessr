# Project Structure

## Root Directory
- `CLAUDE.md` - Project instructions and guidelines for Claude Code
- `components.json` - shadcn/ui configuration
- `package.json` - Dependencies and scripts
- `next.config.mjs` - Next.js configuration
- `eslint.config.mjs` - ESLint configuration
- `postcss.config.mjs` - PostCSS configuration
- `jsconfig.json` - JavaScript project configuration
- `vitest.config.mjs` / `vitest.integration.config.mjs` - The two vitest lanes
- `playwright.config.mjs` - The browser smoke-test lane (`tests/e2e/`)
- `docker-compose.yml` - Local Redis + SRH for the integration lane
- `data-build/` (gitignored) - Local pipeline artifacts awaiting `data:seed`
- `README.md` - Public-facing project readme

## Source Code (`src/`)

### App Router (`src/app/`)
Next.js 16 App Router structure:

#### Pages
- `page.js` - Homepage: region picker and leaderboard modal
- `layout.js` - Root layout component
- `globals.css` - Global styles
- `favicon.ico` - Site favicon

#### Game Pages
- `game/page.js` - Main game interface
- `credits/page.js` - Data sources, licenses, and open-source credits
- `debug/page.js` - Debug hub: lists every debug tool as a peer
- `debug/layout.js` - Shared shell for all debug pages: app bar, DebugNav, theme
- `debug/DebugNav.js` - Segmented peer navigation shown on every debug page
- `debug/bbox/page.js` - Bbox visualization and live Mapillary probing
- `debug/coverage/page.js` - Panorama coverage map, per region
- `debug/coverage/CoverageMap.js` - Leaflet layer for that page

#### API Routes (`src/app/api/`)
- `new-game/route.js` - Creates new game sessions with Redis storage
- `guess/route.js` - Processes guess submissions, scores, and fans out
- `leaderboard/route.js` - Leaderboard data management with Redis
- `skip/route.js` - Skip current round functionality
- `debug/mapillary/route.js` - Mapillary API debugging and testing
- `debug/pano/route.js` - Resolve one panorama id to an image
- `debug/region-coverage/route.js` - A region's outline and panorama points

#### React Components (`src/app/components/`)
- `GameClient.js` - Main game client component
- `LeafletMap.js` - Interactive map for guess placement
- `PanoramaViewer.js` - 360 degree street view display
- `RegionPicker.js` - Homepage province accordion, one row per playable region
- `RegionSelect.js` - Level buttons plus a grouped select, used where a single
  region has to be chosen from 67
- `LeaderboardList.js` - Ranked rows for one board
- `UsernameModal.js` - Username input modal
- `DonateQRModal.js` - Donation QR code modal
- `ThemeToggle.js` - Light/dark switch

### Reusable Components (`src/components/`)

#### shadcn/ui Components (`src/components/ui/`)
Only the primitives the app actually renders are vendored in. Add others with
the shadcn CLI when a screen needs them, rather than keeping unused ones around.

- `accordion.jsx` - Collapsible sections (province expansion)
- `alert.jsx` - Alert notifications
- `badge.jsx` - Badge components
- `button.jsx` - Button variants
- `card.jsx` - Card layouts
- `dialog.jsx` - Modal dialogs
- `input.jsx` - Input fields
- `label.jsx` - Form labels
- `select.jsx` - Grouped select (region picker)
- `skeleton.jsx` - Loading skeletons
- `tabs.jsx` - Tab navigation

### Generated Data (`src/data/`)
Both directories are build output. Do not hand-edit; see *Rebuilding the
generated region data* in [development.md](development.md).

- `regions/index.js` - The 67-node tree: code, name, parent, level, children,
  center, bbox, and coverage flags
- `regions/counts.js` - Per-region panorama and cell tallies. **The one
  panorama-derived file a client component may import** - it carries counts
  only, never a coordinate
- `boundaries/<province>/*.json` - Simplified outlines, one file per region,
  behind a generated `boundaries/index.js` barrel

The panorama index itself is not in the repo: the pipeline writes artifacts to
`data-build/panos/` (gitignored) and `scripts/seed-pano-db.mjs` uploads them to
Neon Postgres, which is what the app queries at runtime.

### Utility Libraries (`src/lib/`)
- `utils.js` - Utility functions including `cn()` for class name merging
- `regions.js` - Client-safe region tree traversal. Imports nothing from
  `pano-index.js` or `pano-db.js`; `tests/regions.test.js` enforces that
- `map-tiles.js` - Client-safe tile provider choice: Geoapify when
  `NEXT_PUBLIC_GEOAPIFY_KEY` is set at build time, OSM public server otherwise
- `pano-index.js` - **Server-side only.** Picks a panorama for a region from
  Postgres and reports which district it landed in
- `pano-db.js` - **Server-side only.** Neon HTTP adapter behind pano-index.js
- `region-request.js` - Resolves and validates a region code from a request
- `game.js` - Scoring ladders (base + region-scaled), distance, formatting
- `username.js` - Player name in localStorage
- `last-region.js` - Last-played region in localStorage (the home page's
  "Continue in ..." row)
- `leaderboard.js` - Leaderboard operations, including the district to province
  to country fan-out
- `mapillary.js` - Mapillary lookup by image id
- `session.js` - Redis-based session management with 30-min expiry
- `upstash.js` - Upstash Redis REST client adapter with multi-tenant key prefix
- `theme.js`, `use-count-up.js` - Theme persistence and a count-up hook

## Build Scripts (`scripts/`)
Each carries a header comment with its flags and its cost.

- `build-region-boundaries.mjs` - OSM/Nominatim to boundaries and the region tree
- `build-pano-index.mjs` - Mapillary z14 tiles to per-province panorama artifacts
- `assign-pano-districts.mjs` - Clips and partitions panoramas by district
- `seed-pano-db.mjs` - Validates the artifacts and uploads them to Neon
- `migrate-leaderboards.mjs` - Backfills the two boards whose code changed
- `build-check.mjs` - Production build into `.next-check`
- `lib/assign-districts.mjs` - District assignment shared by the two pano scripts
- `lib/pano-schema.mjs` - Panorama table DDL shared by the seed and the tests
- `lib/leaderboard-migration.mjs` - Copy, verify, regression-check and restore

## Tests (`tests/`)
Vitest, mostly one file per `src/lib/` module, plus a route test for
`new-game`, `guess`, and `debug/region-coverage`. The `skip`, `leaderboard`,
`debug/mapillary`, and `debug/pano` routes have no dedicated test file; their
underlying `src/lib/` logic (`leaderboard.js`, `mapillary.js`) is still
covered. `fake-upstash-redis.js`, `mock-upstash.js`, `redis-harness.js` and
`wait-for-srh.js` are the shared harness that lets the same files run against
either the in-memory fake or a real Redis. `fake-neon.js`, `mock-neon.js` and
`pano-fixtures.js` are the equivalent for the panorama store: PGlite behind the
Neon SDK boundary, loaded with small synthetic rows.

`tests/e2e/` holds the Playwright smoke specs (`*.spec.js`, so vitest never
collects them): the homepage picker, the username modal, and one full round,
all against browser-level stubs in `tests/e2e/helpers.js` with a fixture
panorama in `tests/e2e/fixtures/`. Deeper UI behavior (`RegionSelect.js`, the
coverage page, real panoramas) remains manual testing only.

## Documentation (`/docs/`)
- `project-overview.md` - Project overview, administrative basis, coverage note
- `features.md` - Detailed game features documentation
- `tech-stack.md` - Technology stack and dependencies
- `development.md` - Development guidelines, commands, and build sequence
- `game-flow.md` - Complete gameplay flow documentation
- `project-structure.md` - This file - project organization

## Planning (`/plans/`)
- Project planning documents and implementation plans

## Public Assets (`public/`)
- `zlp.jpg` - Donation QR code image
- Static assets served directly by Next.js
