# Tech Stack

## Frontend Framework
- **Next.js 16**: React-based full-stack framework with App Router
- **React 19.2**: Component architecture
- **Tailwind CSS 4**: Utility-first CSS framework for styling

## Street View & Mapping
- **Mapillary vector tiles**: the z14 `image` layer is the index source. Read
  offline by `scripts/build-pano-index.mjs` with `@mapbox/vector-tile` + `pbf`,
  against a 50,000 requests/day cap
- **Mapillary Graph API**: one call per round -- lookup by image id, ~230ms.
  Its `/images?bbox=` search is deliberately off the game path: it returns HTTP
  500 in every dense district, because it counts images inside the box before
  applying the limit. See the header of `src/lib/mapillary.js`.
  `api/debug/mapillary/route.js` keeps the search as a diagnostic, and will
  reproduce those 500s
- **Leaflet**: Interactive mapping library for guess placement
- **OpenStreetMap**: Map tile provider for base maps; Nominatim supplies the
  administrative boundaries via `scripts/build-region-boundaries.mjs`
- **@photo-sphere-viewer/core**: 360° panorama viewer

## Geographic Processing
- **@turf/turf**: distance, point-in-polygon, union, simplify, and
  point-to-line distance -- used both at runtime and by the offline builds
- **Generated region tree**: `src/data/regions/` holds the nodes and
  `src/data/boundaries/<province>/` the simplified outlines. The per-province
  panorama indexes live in Postgres (see below), seeded from local pipeline
  artifacts in `data-build/panos/` (gitignored)
- **Client/server split**: `src/lib/regions.js` is the client-safe view and
  imports nothing from `src/lib/pano-index.js` or `src/lib/pano-db.js`. That
  boundary is enforced by an import-graph walk in `tests/regions.test.js` -- the
  panorama rows are exact answers
- **Server-side Calculations**: All geographic processing on backend

## Data Storage & Session Management
- **Neon Postgres (HTTP)**: The panorama index -- 424k rows of id, province,
  district, lat, lng -- read via `@neondatabase/serverless` (`DATABASE_URL` or
  `POSTGRES_URL`). One random-draw query per round, count queries cached
  per process. Seeded by `scripts/seed-pano-db.mjs`, which stages into
  `panoramas_next`, verifies, then renames into place, keeping the previous
  generation as `panoramas_old`
- **Upstash Redis (REST)**: Session and leaderboard storage via `@upstash/redis` SDK (REST client, no sockets)
- **Credential Flexibility**: Accepts `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN` (vanilla Upstash) or `KV_REST_API_URL`+`KV_REST_API_TOKEN` (Vercel Marketplace aliases)
- **Multi-tenant Key Prefix**: All physical keys carry `KEY_PREFIX` (default `vngeoguessr:`) to safely share Upstash DB with other Vercel projects. Prefix applied centrally in `src/lib/upstash.js`; callers use logical keys only.
- **Key Namespaces**: `session:{id}` (30-min TTL), `leaderboard:{scope}`,
  `distance:{scope}` (no expiry). `{scope}` is `vietnam` for the country and
  `city:{regionCode}` for every province and district -- the `city:` segment is
  kept so existing scores stay addressable
- **Sorted Sets**: Leaderboard ranking with automatic trimming (top 200)
- **UUID v4**: Session identifier generation via built-in `crypto.randomUUID()`
- **30-minute Session Expiry**: Automatic TTL-based cleanup

## UI Components & Styling
- **shadcn/ui**: Complete component library with "new-york" style
- **Radix UI**: Headless component primitives -- dialog, label, slot, tabs, plus
  accordion (province expansion) and select (region picker)
- **Lucide React**: Icon library
- **class-variance-authority**: Component variant management
- **tailwind-merge + clsx**: Dynamic class name handling

## Testing
- **Vitest**: Test runner for the logic in `src/lib/`, the API routes, the
  generated region data, and the leaderboard migration
- **In-memory Upstash fake**: Default Redis backing store, no service required
- **PGlite**: In-process Postgres (WASM) mocked in at the
  `@neondatabase/serverless` boundary, so the panorama queries run against real
  Postgres semantics with no service
- **SRH + Redis (Docker)**: Optional lane running the same tests against real Redis
- **Playwright**: Chromium smoke tests for the UI (`tests/e2e/`), with every
  API call and the panorama image stubbed at the browser boundary -- no
  services, no env vars

## Development & Analytics
- **ESLint**: Code linting with Next.js configuration
- **Turbopack**: Development server bundler
- **@vercel/analytics**: User analytics tracking
- **@vercel/speed-insights**: Performance monitoring

## Key Dependencies
- **@upstash/redis**: REST-based Upstash client; no socket pooling, works in edge compute and serverless
- **JavaScript Only**: No TypeScript - pure JavaScript implementation
- **Individual Parameters**: Functions use separate parameters instead of object destructuring
- **Note**: `redis` (node-redis) package not used (replaced by Upstash REST SDK)