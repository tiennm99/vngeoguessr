# Development Guidelines

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run dev:clean` - Same, after clearing the `.next` build cache
- `npm run build` - Build the application for production (writes `.next`)
- `npm run build:check` - Same build for local verification, into `.next-check`
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run the test suite against the in-memory Redis fake
- `npm run test:watch` - Re-run tests on change
- `npm run test:integration` - Run the same suite against a local Redis
- `npm run redis:up` / `npm run redis:down` - Start/stop that local Redis

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

**Mapillary (required)**:
- `MAPILLARY_ACCESS_TOKEN` - Mapillary API token for image fetching

For local Redis without an Upstash account, see *Running Upstash locally* below.

### Testing & Completion

Tests live in `tests/` and cover the logic in `src/lib/`: scoring and distance,
the Upstash key adapter, game sessions, and the leaderboards. Run `npm test`
after changing anything under `src/lib/`.

The suite runs against two backing stores, from one set of test files:

- `npm test` uses `tests/fake-upstash-redis.js`, an in-memory stand-in mocked in
  at the `@upstash/redis` boundary. No service, no Docker, well under a second.
  This is the default.
- `npm run test:integration` runs the same files against a real Redis. Two of
  them skip: one asserts a response shape only an older SDK produces, and one
  fast-forwards half an hour to watch a session expire.

Running both is what keeps the fake honest. A behaviour the fake gets wrong
shows up as a green unit run and a red integration run.

Everything above `src/lib/` (UI, panorama viewer, map interaction, Mapillary
calls) is still manual: inform the user when work is complete. Do NOT start
development servers - user handles testing manually.

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
- No comments unless explicitly requested
- Prefer editing existing files over creating new ones