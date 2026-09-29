# Review round two: findings applied (2026-09-29)

Three independent read-only reviews of `dev` at cca6018, eight days after the
whole-project review of 2026-09-21 whose items were all applied. Gates before
and after: lint 0 problems, production compile green, tests 409 before and
415 after.

- [Backend and API](code-review-260929-1940-backend-api.md)
- [Frontend](code-review-260929-1940-frontend.md)
- [Test quality](tester-260929-1940-test-quality.md)

## Verdict

The load-bearing invariants hold: session ids are server-minted, a guess
claims its session before any board write, the answer district never leaves
the server before the guess, the daily credits no board, the debug routes are
closed in production, and no client chunk carries server code. What the
reviews found is one real correctness defect in the daily, a handful of
accessibility and copy problems on the game screen, and a few hardening
items. Everything below is applied on `dev`, uncommitted.

## Applied

### Backend

- **The daily could switch panorama on a single non-transient failure.** The
  rule was "anything that is not a timeout or 5xx proves the image is gone",
  which included a 403 from a token missing a scope, a 200 whose body was an
  HTML gateway page, a missing thumbnail, and a Redis error thrown inside the
  same `try`. Any of those on the cached pick deleted `daily:{day}` and the
  next candidate was stored for everyone after. Now `UpstreamError` carries a
  `'gone'` code (Mapillary 400 or 404, or no thumbnail) and only that moves
  the day; every other failure is thrown. The Redis calls sit outside the
  retry. Tests: a 403 and a malformed answer keep the pick; a 503 on the first
  seeded candidate caches nothing and the same candidate is served once the
  blip passes. The 403 test fails against the old code.
- **The 8 s draw budget now caps the request in flight**, not only whether
  there is a next attempt; two 5 s timeouts could reach 10 s before.
- **The Mapillary token travels in an `Authorization` header**, not the query
  string, so it stays out of logs that quote URLs. Test asserts both.
- **Usernames are NFC-normalised** before validation: a tone mark typed as a
  combining character was rejected, and would otherwise have made two board
  members of one name. Test with a decomposed `ả`.
- **The debug key is compared in constant time.**
- **A panorama whose district the region tree does not know fails the draw**
  before a session is written, rather than failing `/api/guess` after the
  session is consumed. Test inserts such a row.
- **Every Redis command and Neon query has a deadline** (5 s and 8 s). The
  Upstash client retried a hung connection five times with exponential
  backoff, past the browser's fifteen-second wait; the Neon client had no
  limit at all. Checked against the installed clients: the Upstash `signal`
  factory caps the whole call, retries included, and Neon takes
  `fetchOptions.signal` per query. The platform is not the constraint:
  Vercel Hobby on Fluid compute allows 300 s by default (docs, 2026-08-24),
  so the "ten seconds" comment on the draw budget was stale and is corrected.
- **Dead code removed**: the country branch of `countPanos` (only tests called
  it) and the `MAX_PER_CITY = Infinity` cap in the index build.
- The daily route's header comment said the daily "credits the boards once";
  it credits none.

### Frontend

- **The "some boards could not be updated" line was invisible** (white on
  white in light, near-black on near-black in dark) and inside a `<details>`
  that is not rendered when every board write fails. It now renders whenever
  the round is partial, outside the details, readable, with `role="status"`.
- Keyboard guessing (Enter at the map centre) was applied and then reverted:
  the maintainer wants the guess placed with the mouse.
- The expanded phone minimap no longer claims `aria-modal` (it traps no
  focus and the Submit bar stays usable).
- A non-JSON reply (a gateway timeout page) shows a sentence, not the
  parser's message.
- **Contrast**: light `--success`, `--warning` and `--danger` darkened so the
  distance badges clear 4.5:1 (were 3.70 to 4.37); the attribution and one
  other muted line lost their `/80` opacity; light `--muted-foreground` moved
  from L 0.54 to 0.50 for margin against the background art under the
  translucent surface.
- A prefetched next round older than 20 minutes is dropped for a fresh fetch
  (its session expires at 30).
- Two consecutive rounds with the same score no longer flash the old total
  before counting up.
- The result map's two resize timers are cleared on unmount.
- The first Escape in the map search only closes the result list; the second
  collapses the map.
- `audio.js` reads and writes through `storage.js`.
- A panorama that fails to render now reaches `onError`, so the error sound
  plays and loading clears.
- Dead `try/catch` around a non-awaited fetch and a bare handler alias removed.

### Tests

- Region-coverage boundary asserted as a GeoJSON Feature with a polygon, not
  just truthy.
- Seeded picks asserted to resolve to a known province or district across
  twelve seeds.
- Debug key: near-miss lengths rejected.

### Docs and memory

- `docs/development.md` and `docs/features.md` state the `'gone'` rule.
- The code-reviewer agent memory no longer says `/api/new-game` reuses a
  client session id.

## Not applied, with reasons

- **`OFFSET` scans on Neon** (backend 5): cost is plausible, not measured.
- **`fetchRegionPanorama` returning `{success, kind}`** instead of throwing
  (backend 6): a discriminated result is not string-matching; churn without a
  behaviour change.
- **Stranded-rate check ordering in `assign-pano-districts`** (backend 9): the
  seed step still refuses a bad upload.
- **`priority` to `preload` on `next/image`**: the bundled Next docs could not
  be read to confirm the deprecation.
- **Cross-tab sync of the mute flags**: would need a second subscription
  layer and a test stub change for a nicety.
- **A test for the backup script's empty-board exit**: the script runs at
  import against real credentials; a harness for one `process.exit` is not
  worth it.
- **Frontend Lows** L7, L8, L10 to L13 (daily replay viewer behind the dialog,
  `memo` never skipping, `AbortSignal.any` on old iOS, 36 px buttons in the
  leaderboard dialog, a possibly redundant theme re-apply, the CoverageMap
  ref disable). Listed in the frontend report.

## Corrections to earlier records

The 2026-09-21 Resolution says loading `MapSearchBox` on demand took the
region tree off `/game`. The frontend reviewer checked the build: the tree is
still in the `/game` and `/daily` first-load chunk. The split is optional;
the claim was wrong.

## Open questions for the maintainer

1. Do preview deployments share the production Redis and Neon? The debug
   routes are open on preview by design.
