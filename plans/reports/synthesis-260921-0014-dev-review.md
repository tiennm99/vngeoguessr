# Review of the dev implementation (2026-09-21)

Three independent read-only reviews of `main...dev` (064c173). No code changed.

- [Correctness and security](code-review-260921-0014-dev-implementation.md)
- [UX of the new surfaces](ui-ux-review-260921-0014-dev-surfaces.md)
- [Test quality](tester-260921-0015-dev-test-quality.md)

Gates re-run by the reviewers: 348 tests pass, lint 0 errors, production
compile green. e2e not runnable here.

## Verdict: not ready to merge

One blocker, verified against source.

**B1. The daily is a leaderboard-farming loop.** `/api/daily` mints a fresh
session on every call, the panorama is the same all day, and the first
`/api/guess` returns the coordinates. Two requests per 5 points on three
permanent boards, repeatable all day. The "no daily board, so a second attempt
only cheats the player" premise is false while the daily credits the main
boards. Fix: skip both fan-outs in the guess route when `session.mode ===
'daily'` and record stats only. That is what "no daily leaderboard" meant.

## Should fix before merge

- **S1** `stats:players:{day}` can miss its EXPIRE and live forever: the TTL
  is gated on the hash counter, not on the HyperLogLog's own first write.
- **S2** Home page hydration mismatch: DailyCard falls back to
  `dailyNumber(dailyDay())` during SSR of a static page, so the frozen number
  differs from the client's every day after deploy. Derive it from state only.
- **S3** Daily replay forces `isPano: true`; store the flag with the result.
- **S4** A cached daily URL that stops resolving breaks the day for 48h with
  no lever. Cache id and coordinates, re-resolve the URL per request.
- **S5** Score fan-out `Promise.all` can half-credit and still answer 500,
  which the client reports as "nothing was scored".
- **S6** Result-dialog board rows still show ASCII names
  (`leaderboard.js` uses `getRegion(code).name`), so the reveal is
  Vietnamese and the rows beneath it are not. The e2e stub was updated to
  Vietnamese and now asserts text production does not produce.
- **S7** `tests/e2e/home.spec.js:16` still expects `Ha Noi`, `Da Nang`,
  `Lam Dong`; only the Ho Chi Minh entry was renamed. Would fail on a local
  e2e run.
- **UX H1** Nothing says "one guess" before the daily submit. Card copy and a
  "Submit final guess" label in daily mode.
- **UX H2** Share button state is not announced: aria-label overrides the
  sr-only text, no live region, and a cancelled share sheet reads "Retry".

## Worth doing, not blocking

- UX: failure copy says "start a new one" inside the daily; DailyCard buttons
  are 36px; three-button action row is ~288px against 280px at 360 wide;
  "Right province, wrong district" shown when the answer has no district;
  streak badges are emoji plus title only.
- Tests: no test for the daily when Mapillary fails four times, for the guess
  route when scoring throws after consumption, for stats tolerating a Redis
  outage, or for EXPIRE across two days. `daily-route.test.js` compares
  against the live `dailyDay()` and can flake across Vietnam midnight.
- Backup workflow uploads every username as an artifact on a public repo
  (artifacts are downloadable by any logged-in GitHub user). Usernames only,
  no personal data, but decide whether that is acceptable.
- `debug-access.js` keys off `VERCEL_ENV`; a non-Vercel deploy is fully open.

## Confirmed correct by the reviewers

Validation precedes session consumption; atomic DEL claim; malformed body is
400; answer only post-guess; ZINCRBY halves the fan-out; untrimmed boards with
a 200 window; UUID gating on skip and new-game; skip race fixed; debug gate on
both surviving routes; region-hit grading; daily determinism and UTC+7
rollover; streak rule; stats key layout; Redis fake semantics for the new
commands; 84 of 85 nodes carry `nameVi`; share text carries no coordinates.

## Unresolved

- Should the daily credit the main boards at all? Recommendation: no.
- Real lifetime of a Mapillary `thumb_2048_url`. Decides how urgent S4 is.
- Is a world-readable username list in a backup artifact acceptable?

## Resolution (same day)

Every finding above was applied on `dev`; see the commit "fix: close the
review findings on the dev implementation".

- **B1** The daily credits no board. `/api/guess` skips both fan-outs for
  `mode: 'daily'`; the round is scored and counted only. Test asserts no
  leaderboard or distance key is written by a daily guess.
- **S1** The players HyperLogLog's TTL rides on its own first write (PFADD
  returning new), not the hash counter. Test covers a cookieless first round.
- **S2** DailyCard derives the number from mounted state only; no render-time
  fallback, so the static HTML and the client agree.
- **S3** `isPano` stored with the daily result and used on replay.
- **S4** The daily caches the pick only; the image URL is resolved per
  request. A cached pick that stops resolving is forgotten and the next seeded
  candidate takes over. Tests cover recovery and four-failure exhaustion.
- **S5** Score fan-out uses `allSettled`: levels that wrote are returned with
  `partial: true`, and only a round where nothing wrote is a 500. Dialog says
  "Some boards could not be updated" instead of "Nothing was scored". Test
  injects a failing ZINCRBY on one key, on all keys, and a stats outage.
- **S6** Board rows and `/api/leaderboard` use `regionName()`.
- **S7** The home spec lists the accented province names; the stub no longer
  emits `trimmed`.
- **UX H1** Card copy says "one guess"; the daily submit button reads "Submit
  final guess".
- **UX H2** Share button label is its accessible name, a `role="status"`
  sibling announces the outcome, a cancelled share sheet is `'cancelled'` and
  shows the plain button again, failure shows an alert icon with "Retry".
- **UX M1–M5** Daily failure copy has no "start a new one"; DailyCard buttons
  are default height (44px); the dialog action row is h-12 throughout with an
  icon-only Share below `sm`; a province-level answer reads "Right province";
  streak badges carry sr-only "-day streak" text.
- **Lows** "Play today's challenge"; badge truncation via an inner block span;
  compact ThemeToggle is a single button, no one-child group; the failure
  block drops `role="alert"` (the dialog description already announces);
  reduced-motion covers the dialog's enter/exit animation.
- **Nits** `pickPanoBySeed` hashes the offset per province; the debug gate
  treats a production build without Vercel variables as production; the
  backup artifact is encrypted with a `BACKUP_PASSPHRASE` secret before upload.
- **Tests** Year-wrap `previousDay`; daily route day assertion bracketed
  across a possible midnight; two-day stats TTL.

Not changed, by decision: two ThemeToggle instances swapped by breakpoint
(matches SoundToggle); CI running twice on a dev→main PR; `/api/daily`
unauthenticated like every other route (the Vercel WAF rule covers it).
