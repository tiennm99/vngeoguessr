# Development Guidelines

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run dev:clean` - Same, after clearing the `.next` build cache
- `npm run build` - Build the application for production (writes `.next`)
- `npm run build:check` - Same build for local verification, into `.next-check`
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run the test suite against the in-memory Redis and Postgres fakes
- `npm run test:watch` - Re-run tests on change
- `npm run test:integration` - Run the same suite against a local Redis
- `npm run redis:up` / `npm run redis:down` - Start/stop that local Redis
- `npm run test:e2e` - Playwright browser smoke tests, fully stubbed, no env
  needed (first time: `npx playwright install chromium`)

## Important Development Guidelines

### JavaScript Only
- This project uses **JavaScript exclusively**
- Never create or suggest TypeScript files (.ts, .tsx)
- All components and utilities should be .js or .jsx files

### Function Parameters
- All functions should use **individual parameters** instead of object destructuring
- Use `function(param1, param2)` instead of `function({param1, param2})`
- This applies to React components, utility functions, and API handlers

### File Modification Policy
- **Only modify source code files**, documentation (/docs), and plans (/plans)
- Configuration changes (package.json, next.config.mjs, eslint.config.mjs, components.json, etc.) should be highlighted for manual processing
- Environment files and build settings require manual review

### Security Best Practices
- Never expose or commit secret keys and sensitive information
- Server-side session management prevents client-side coordinate access (Redis TTL 30 min)
- All geographic calculations must be performed server-side
- Session cleanup after guess submission for security

### Environment Variables

**Redis (required)**:
- Either `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (vanilla Upstash)
- Or `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel Marketplace)
- Optional: `KEY_PREFIX` (default: `vngeoguessr:`) for multi-tenant DB sharing

**Postgres (required)**:
- `DATABASE_URL` (or the `POSTGRES_URL` alias) - Neon connection string holding
  the panorama index. Provision Neon from the Vercel Marketplace and pull the
  vars with `vercel env pull`, then seed with `npm run data:seed`

**Mapillary (required)**:
- `MAPILLARY_ACCESS_TOKEN` - Mapillary API token for image fetching

**Map tiles (optional)**:
- `NEXT_PUBLIC_GEOAPIFY_KEY` - Geoapify API key. When set (at build time), all
  Leaflet maps serve tiles from Geoapify, whose free tier permits commercial
  use; unset, they fall back to the OSM public tile server (fine for dev/e2e,
  not for a commercial deployment). The key is public by design — restrict it
  to the production domain in the Geoapify dashboard. Provider choice lives in
  `src/lib/map-tiles.js`

For local Redis without an Upstash account, see *Running Upstash locally* below.

### Testing & Completion

Tests live in `tests/` and cover the logic in `src/lib/` (scoring and distance,
the Upstash key adapter, game sessions, the region tree, the panorama indexes
and the leaderboards), the API routes, and the leaderboard migration. Run
`npm test` after changing anything under `src/lib/` or `src/data/`.

The suite runs against two backing stores, from one set of test files:

- `npm test` uses `tests/fake-upstash-redis.js`, an in-memory stand-in mocked in
  at the `@upstash/redis` boundary. No service, no Docker, well under a second.
  This is the default.
- `npm run test:integration` runs the same files against a real Redis. Two of
  them skip: one asserts a response shape only an older SDK produces, and one
  fast-forwards half an hour to watch a session expire.

Running both is what keeps the fake honest. A behaviour the fake gets wrong
shows up as a green unit run and a red integration run.

The panorama queries run against PGlite -- real Postgres in-process -- mocked in
at the `@neondatabase/serverless` boundary (`tests/mock-neon.js`), in both
lanes; only Neon's own endpoint speaks the production driver's protocol, so
there is no separate integration lane for it. Fixture rows come from
`tests/pano-fixtures.js`. The data-quality invariants that used to run in
`tests/pano-index.test.js` against the committed JSON now run inside
`scripts/seed-pano-db.mjs`, which refuses to upload artifacts that violate
them (`npm run data:seed -- --check` runs just that gate).

The UI has a Playwright smoke lane: `npm run test:e2e` runs `tests/e2e/*.spec.js`
in Chromium against a dev server it starts (or reuses) itself. Every `/api/*`
call and the panorama image are stubbed at the browser boundary
(`tests/e2e/helpers.js`), so it needs no Redis, Neon, Mapillary, or `.env`.
It covers the region picker, the username modal, and one full round to the
reveal. Anything beyond those flows (real panoramas, real scoring round-trips)
is still manual: inform the user when work is complete. Do NOT start
development servers - user handles manual testing themselves.

### When the dev server needs restarting

Almost never. Measured against this project:

| Change | Behaviour |
|---|---|
| Components, pages | Fast Refresh, ~200ms |
| API routes | Hot reloaded, ~1.6s |
| Server libs under `src/lib/` | Hot reloaded, ~1.8s |
| Index data under `src/data/` | Hot reloaded, ~1.1s |
| `next.config.mjs` | Next restarts itself |
| `.env` | Reloaded in place |

Do not run `npm run build` while a dev server is running. Both own the same
output directory, so the build replaces manifests the dev server is still
reading, and it logs a burst of `ENOENT: no such file or directory` errors for
manifest files under that directory. Measured: 110 such errors from one
overlapping build, and none when the two do not overlap. They are noise from the
collision, not a fault in the code being edited.

Use `npm run build:check` instead. It builds into `.next-check` and leaves the
dev server alone. The plain `build` script is unchanged, because that is what the
deployment platform runs and it must keep writing the default directory.

If a change genuinely will not take effect, the build cache is usually
inconsistent rather than the code being wrong. That happens after a build is
killed part-way or a different Next version writes into `.next`, and it shows up
as the dev server serving 500s for everything. `npm run dev:clean` clears the
cache and starts fresh; a plain restart will not fix it.

### Running Upstash locally

Upstash itself is cloud-only, but `@upstash/redis` speaks HTTP REST, so any
server exposing that REST surface is indistinguishable to the app.
`docker-compose.yml` runs the proxy Upstash's own docs recommend, SRH
(`hiett/serverless-redis-http`), in front of a real Redis:

```bash
npm run redis:up     # redis + SRH on http://localhost:8079
npm run redis:down   # stop and discard the data
```

`npm run test:integration` points at it automatically. To use it for `npm run
dev` as well, set in `.env`:

```
UPSTASH_REDIS_REST_URL=http://localhost:8079
UPSTASH_REDIS_REST_TOKEN=vngeoguessr-local-token
```

SRH accepts commands only as a JSON array POSTed to `/`, which is what the SDK
sends; the path form Upstash also supports (`GET /set/key/value`) returns 404.

### Rebuilding the generated region data

`src/data/regions/` and `src/data/boundaries/` are generated and committed;
the panorama index is generated into `data-build/panos/` (gitignored) and
served from Postgres. Run the scripts in this order -- each reads what the
previous one wrote:

```bash
npm run data:boundaries    # OSM/Nominatim -> boundaries + region tree
npm run data:panos         # Mapillary z14 tiles -> per-province pano artifacts
npm run data:districts     # clip + partition panos by district; writes counts.js
npm run data:seed          # validate the artifacts and upload them to Neon
```

Each underlying script's header comment carries its flags and its cost; read it
before running. Two things worth knowing up front:

- `npm run data:repartition` reruns the boundaries step with `--regenerate`
  (rebuilds the provinces, the barrel and the tree from what is already on
  disk) and then the districts step, with no network calls. Use it after
  hand-editing a boundary.
- `npm run data:panos` spends Mapillary tile requests against a 50,000/day cap.
  `npm run data:districts` spends none -- it only re-partitions indexes that
  already exist, and refuses to rewrite `counts.js` on a partial run.
- `npm run data:seed` spends none either. The full run stages into
  `panoramas_next`, verifies, and renames into place, keeping the previous
  generation as `panoramas_old`; `-- --province=DN` reseeds one province in
  place; `-- --check` validates the artifacts without touching the database.
  Deploy the app and the seed in either order: the schema is unchanged, and
  running processes keep serving their cached counts until they recycle.

## Styling Conventions

One design system for every page, including debug pages. It is Tailwind 4 +
shadcn tokens, defined in `src/app/globals.css` (`:root` and `.dark` blocks);
the theme toggle works only on pages that stay inside it.

- **Page background**: `flex-1 vn-surface` on the page root. `layout.js`
  wraps every page in a `min-h-dvh` flex column whose last row is the credit
  footer, so a page fills the viewport minus that strip rather than claiming
  the whole viewport itself.
- **Surfaces**: shadcn `Card` with `bg-card border-border shadow-sm`; nested
  panels `bg-muted/50`. Never `bg-white/10` glassmorphism or raw hex.
- **Text**: `text-foreground` for headings, `text-muted-foreground` for
  secondary, `text-card-foreground` inside cards. Never `text-white` on a
  themed surface.
- **Accent**: the `brand` token family (`text-brand`, `bg-brand-subtle`,
  `text-brand-subtle-foreground`) -- see `RegionPicker.js` for the idiom.
- **Result semantics**: the `success` / `warning` / `danger` token pairs
  (each with a `-foreground`) for good/near/far judgements, and `rank-gold` /
  `rank-silver` / `rank-bronze` for podium tints -- see `RoundResultDialog.js`
  and `LeaderboardList.js`. Each token carries its own light and dark value in
  `globals.css`, so call sites never write a `dark:` variant.
- **Borders/dividers**: `border-border`.
- **Components**: use the vendored `src/components/ui/` primitives; add
  missing ones with the shadcn CLI rather than hand-rolling.
- **Icons**: Lucide only; no emoji glyphs in interactive chrome.

### Layering

One z-index ladder for the app, in `globals.css` `:root`, low to high:
`--z-backdrop` (the key art behind every page) · `--z-pane-chrome` (controls
over a map or panorama) · `--z-floating` (the phone minimap) · `--z-appbar`
(the game action bar) · `--z-fab` · `--z-overlay` (dialog scrim) · `--z-modal`
(dialog content) · `--z-popover` (a select opened inside a dialog). Use
`z-(--token)`; never an arbitrary `z-[…]`.

`--z-backdrop` is the only negative rung: `AppBackground` is a fixed child of
`<body>`, so it paints over the canvas and under every page. The ground it
shows through is `.vn-surface`, which is translucent for exactly that reason --
keep it that way, and keep panes that must stay legible (cards, the game
header, the panorama surround) opaque.

Third-party ladders are contained rather than out-bid: Leaflet (200-1000) and
Photo Sphere Viewer (50-9999) each live inside a pane carrying `isolate`
(`GuessMapPanel`, its inner map wrapper, and the panorama pane in
`GameClient.js`), so their values never reach the root stacking context and the
pane's own chrome can sit on `--z-pane-chrome`.

Two heights other elements measure against are tokens too: `--footer-h` (the
credit strip) and `--action-bar-h` (the game's submit bar). Offset against
those, not against the pixel value they happen to hold.

### Fixed-surface layout

The game screen does not scroll, so its vertical budget is the constraint --
about 271px of content on a 667x375 landscape phone. Chrome that floats over
the panorama goes in flow where it can (the how-to-play hint rides
`PanoramaViewer`'s `topBarSlot`, beside the Mapillary credit) and is sized
against the viewport where it cannot (the collapsed minimap is
`min(9rem,30vh)`). `viewport.viewportFit` is `cover`, so the game header and
content box pad themselves with `env(safe-area-inset-left/right)` and the
footer strip owns `env(safe-area-inset-bottom)`.

Third-party map chrome is sized for a full map, so each state gets what fits.
On the phone guess map, Leaflet's tile credit and zoom buttons are hidden while
the minimap is a collapsed thumbnail (behind a cover that swallows clicks, with
the credit wrapping to five lines) and return when it expands, where the zoom
control is lifted clear of the two-line credit. The permanent tile attribution
lives on `/credits`, which carries all three credits the Geoapify free plan
requires.

Inside these surfaces, size with flex or insets -- never a percentage height.
Below `layout.js`'s column every ancestor's height comes from flexing against a
`min-height`, which is indefinite, so `h-full` and `h-[45%]` silently collapse
to content height. Use `flex-1` for a share of the space and `absolute inset-0`
to fill a positioned box.

Raw palette colors are allowed only where the color must not follow the theme:
the `bg-neutral-900` surround behind panoramas and full-bleed maps (dark in
both themes on purpose), and the Leaflet marker hexes in `ResultMap.js`
(`MARKER_COLORS`), which render outside the CSS token cascade.

## shadcn/ui Configuration

- **Style**: "new-york"
- **Path aliases**: Configured for `@/components`, `@/lib`, etc.
- **Components**: Use JavaScript (.js) not TypeScript
- **CSS variables**: Enabled for theming
- **Components location**: `src/components/ui/`

## Code Style Standards

- Follow existing code patterns in the codebase
- Use established libraries and utilities already present
- Maintain consistent naming conventions
- Write descriptive comments where the reason for the code is not obvious from
  the code -- this codebase leans on them heavily to record why a measured
  approach was chosen over the obvious one
- Prefer editing existing files over creating new ones