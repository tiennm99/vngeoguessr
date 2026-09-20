# Improvement rollout (2026-09-20)

What shipped from the revised sequence in
[synthesis-260920-2201-improvement-brainstorm.md](synthesis-260920-2201-improvement-brainstorm.md),
all on branch `dev`, and what is left. Constraint honoured throughout: no
provider or stack change, nothing that costs money.

## Shipped

| Commit | Phase | What |
|---|---|---|
| `3314da1` | 0, 1 | Debug API closed in production behind `DEBUG_ACCESS_KEY`; bbox tester deleted. Shared username rule (Unicode letters, no `:`), finite coordinates before the session is consumed, UUID-only session ids, JSON-body guard, failure `reason`. Score boards untrimmed and ZINCRBY (ratchet fixed, concurrent rounds counted). Distance record best-effort after scoring. Daily stats counter + `npm run stats`. |
| `e649259` | 2 | Expired-round copy, region-hit line ("Right province, wrong district") located server-side, OpenStreetMap link on the reveal, Share button with squares text, Open Graph metadata, phone header collapse, fresh id after skip, PanoramaViewer loaded on demand (three.js out of first load). |
| `8450b75` | 3 | Daily challenge at `/daily`: deterministic pick per Vietnam day, cached 48h, no daily board, browser-side one-attempt and streak, home card, daily share text. |
| `6dbe2e0` | 4 | Vietnamese names: `nameVi` in the tree from the OSM queries, `regionName()` everywhere a name is shown, search matches both spellings, Geist `vietnamese` subset. |
| `064c173` | ops | CI workflow (lint, test, production compile) on push and PR. Weekly leaderboard export to a 90-day artifact. |
| review fixes | — | Every finding of the three-agent review, see [synthesis-260921-0014-dev-review.md](synthesis-260921-0014-dev-review.md): the daily credits no board, partial credit reported honestly, stats TTL, hydration fix, Vietnamese board rows, encrypted backup, UX and a11y items. |

Gates at the end: 357 tests pass, lint 0 errors / 21 warnings (all the
pre-existing localStorage-in-effect and callback-ref patterns), production
compile green with and without environment variables.

Redis per completed round: about 23 commands (was 27). Distance boards remain
9 of them.

## Manual steps for the maintainer

- Set `DEBUG_ACCESS_KEY` in Vercel production if the debug pages should work
  there; unset, the debug API is closed.
- Optional `NEXT_PUBLIC_SITE_URL` for absolute Open Graph URLs (Vercel's
  production URL is the default).
- Repository secrets `KV_REST_API_URL`, `KV_REST_API_TOKEN` (and `KEY_PREFIX`
  if set) plus `BACKUP_PASSPHRASE` for the backup workflow.
- One Vercel WAF rate-limit rule on `/api/*`. Free on Hobby, dashboard only.
- Merge `dev` to `main` to deploy.

## Not done, and why

- **Distance boards** still cost 9 commands a round. Every report questioned
  them; removing them changes the leaderboard UI. Product call.
- **Open Graph image** per region. Metadata is text only. Optional polish.
- **Panorama movement, duels, curated landmarks, accounts, weekly boards**:
  cut by the review round as wasted effort at this scale or as needing a
  hosting model change.
- **e2e specs** were updated to the Vietnamese names but could not be run here
  (no browser). Run `npm run test:e2e` locally before merging.

## Watch after deploy

- `npm run stats` after two weeks. Under ~20 players a day the next slice is
  distribution, not mechanics.
- Whether the daily's cached Mapillary URL ever 403s inside its 48h window.
- Whether `Củ Chi`-style accented names render in Geist on iOS (font subset
  is loaded; glyph coverage not verified on a device).
