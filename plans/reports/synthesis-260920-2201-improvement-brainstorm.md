# Synthesis: how to improve VNGeoGuessr (2026-09-20)

Four parallel brainstorms, read-only, at commit 5406b38. Source reports:

- [Gameplay & retention](brainstorm-260920-2201-gameplay-and-retention.md)
- [UI/UX audit (code-only)](ui-ux-review-260920-2201-improvement-brainstorm.md)
- [Codebase health](code-review-260920-2201-codebase-health.md)
- [Geo-game landscape research](research-260920-2201-geo-game-landscape.md)

Gates at time of scan: 292 tests pass, lint 0 errors / 20 warnings, build green.

## Where the four agree

1. **No unit of play.** Endless single rounds; nothing to finish, share, or return
   to. Gameplay, UX and research all land on: 5-round run + summary → share text
   → daily challenge + streak. Same machinery, in that order.
2. **Leaderboard model is undecided and it bites.** Score board trims below top
   200 and *discards* that player's total (leaderboard.js `creditScore`; the
   comment acknowledges it). Once 200th place holds >5 points, no new player can
   ever enter. Gameplay report independently flags all-time cumulative as
   "unwinnable for late arrivals". Fix and product decision are the same
   question: career total vs weekly/seasonal board vs display-window-only trim.
3. **Feedback gap for mediocre guesses.** A 2 km and a 400 km miss both read
   "0 / Missed"; rank outside top 200 reads as a dead end; ladder hidden in a
   collapsed details. UX (M2, M7-idea) and gameplay (ideas 4a, 7) converge on a
   display-only closeness/region-hit readout that leaves the one-ladder decision
   intact.
4. **Free-tier ceilings are the real availability risk.** ~27 Redis commands per
   round on a 500K/month plan (~18.5K rounds), no rate limiting on any route,
   three unauthenticated debug routes spending Neon and the Mapillary token.
   Every retention idea adds commands, so budget hygiene comes first.
5. **Distribution before retention.** Gameplay report challenges the premise:
   if DAU is single digits, shareable text + OG tags + Vietnamese UI beat any
   loop. Research confirms plain link sharing with Open Graph tags is the
   zero-cost Zalo/Facebook path; no Zalo integration needed.

## Verified bugs worth fixing regardless of roadmap (all S except H1)

| Finding | Where | Effort |
|---|---|---|
| Top-200 trim erases totals (ratchet) | src/lib/leaderboard.js creditScore | M + decision |
| NaN coordinates pass validation, session consumed, then 500 | src/app/api/guess/route.js ~L41 | S |
| Username validated client-side only; `:` corrupts distance member packing | UsernameModal.js, guess/route.js, leaderboard.js | S |
| `?sessionId=` used verbatim as Redis key | new-game/route.js | S |
| Read-modify-write on score → lost update; use ZINCRBY | leaderboard.js | S |
| Session-expired error shown as "guess could not be saved" | GameClient.js ~L224 | S |
| Game header overflows on ≤414px, clips mute/beer after round 1 | GameClient.js:428 + header cluster | S-M |
| Stale "per-board ladder" tooltips contradict features.md | GameClient.js:455, RoundResultDialog.js:400 | S |
| three.js in first-load chunk (624 KB); PanoramaViewer not dynamic | GameClient.js:6 | S |

## Proposed sequence

**Phase 0 — hygiene (1 short session).** NaN/username/sessionId validation,
ZINCRBY, dynamic PanoramaViewer, stale tooltips, expiry copy, header overflow.
Add a GitHub Actions workflow (lint/test/build:check) and a leaderboard export
script on a schedule. No product decisions needed.

**Phase 1 — edge + budget.** One `middleware.js`: rate limit `/api/*` keyed on
`vng_pid` + IP via `@upstash/ratelimit`, gate or delete `/api/debug/*` in
production. Pipeline the guess fan-out. Log one per-round budget line.

**Phase 2 — decide the board.** Pick: (a) trim is display-only, totals kept in
an unbounded key; (b) weekly boards with TTL alongside all-time; (c) status quo
accepted. Gameplay recommends (b) country-level only (+4 commands) if at all.

**Phase 3 — unit of play.** 5-round run, summary screen, share text
(emoji squares, Web Share API, no coords/pano id/district in the text), OG tags
on `/game/{region}`. Display-only closeness readout + "explore this spot" link.

**Phase 4 — return loop.** Daily challenge (`daily:YYYY-MM-DD`, 48h TTL,
dated board), streak counter, then async "challenge a friend" links on the same
seeded-set machinery. Passport (districts seen) in localStorage.

**Later / not now.** Panorama movement (multiplies Mapillary calls), curated
landmarks pool (L, offline), realtime duels (needs persistent server, breaks
Vercel model), Vietnamese UI (do with a distribution push).

## Decisions only the maintainer can make

1. Leaderboard model (career / weekly / display-only trim). Blocks phase 2 and
   any competitive feature.
2. Keep `/api/debug/*` public in production, or gate it? Coordinate exposure
   was an accepted decision; the metered-cost side is new.
3. Identity: keep forgeable localStorage names forever, or lightweight accounts
   before daily/duel boards?
4. Scoring feedback: display-only readout (4a, recommended, reversible) vs
   continuous headline score (4b) vs board change (4c, reverses recorded decision).
5. Music default-on with a modal covering the mute button on first tap: keep,
   delay first play until after the username modal, or start muted?

## Unresolved facts to look up

- Actual visitors/day and repeat rate (Vercel analytics `/game/{region}` rows).
- Current Upstash monthly command count.
- Whether Mapillary `thumb_2048_url` embeds the image id (if yes, `/api/debug/pano`
  turns a live round's image URL into its answer).
- Whether Mapillary thumb URLs expire (decides daily-set caching).
- Header overflow thresholds and PSV keyboard behaviour need one real device pass.

## Review round (2026-09-20, second pass)

Three independent reviews of the above:

- [Findings verification](code-review-260920-2220-health-findings-verification.md)
- [Roadmap red-team](brainstorm-260920-2220-roadmap-red-team.md)
- [Roadmap counsel](advisory-260920-2220-roadmap-counsel.md)

### Corrections to the sections above

- **NaN coordinates: downgraded.** Validation does let non-finite values
  through, but turf throws inside `calculateDistance` *before* the session is
  deleted, so the player can retry. Residual: a 500 where a 400 belongs.
- **Rate limiting: wrong file and wrong tool.** Next 16 replaces
  `middleware.js` with `proxy.js`; a stale `middleware.js` can be silently
  ignored. And a Redis-backed limiter spends the budget it protects. Vercel
  Hobby ships one WAF rate-limit rule plus three custom rules; blocked
  requests never reach a function. Use that.
- **Pipelining is latency, not budget.** Upstash bills per command.
- **Mapillary thumb URLs do not expire quickly** (~30 days). A daily set can
  cache resolved URLs; the planned expiry fallback is unnecessary.
- **Distance boards cost 9 of ~27 commands per round** for a board every
  report criticised. Cutting them plus ZINCRBY plus reusing the history read
  takes a round to ~14 commands. That is what funds any multi-round feature.
- **"Vietnamese UI is reach not retention" is wrong as stated.** Every region
  name in the generated tree is unaccented ASCII, the font loads `latin`
  only, and the username modal rejects `Tiến`. This is correctness for the
  home market, not localisation.
- Prior health report cites several line numbers past EOF (mapillary.js,
  player-id.js, debug/pano). Content confirmed; citations unreliable.

### New findings (verified)

- **Live-round answer leak, verified against production with read-only GETs.**
  `/api/debug/pano?id=` returns coordinates for any id, unauthenticated.
  `/api/debug/region-coverage` returns every pano `{id, lat, lng}` for a
  district, up to 40,000 per request, billing Neon each time. The
  `thumb_2048_url` CDN path token is stable per image, so a precomputed
  path→coords table for a district turns a live round's image URL into its
  answer. The "pano id stays server-side" comment in new-game buys nothing
  while these routes are public. Coordinate exposure was a recorded
  decision; the live-round consequence is new evidence. Triage before any
  roadmap phase.
- **Unawaited `/api/skip` DEL races the next round's SET** on the same
  session key; a late DEL kills a live round.
- **Partial credit on failed submit.** Score fan-out and distance fan-out run
  non-atomically after the session is consumed; a distance failure returns
  500 with scores already written and the client says "not recorded".
- **Bare `request.json()`** in guess and skip routes turns malformed bodies
  into 500s.
- **Distance member id** `username:distance:Date.now()` collides within a
  millisecond and lacks the finiteness check the score path has.
- **Doc drift:** README/features.md say 5 provinces / 61 districts; overview
  says 9 / 75.

### Revised sequence (red-team + counsel agree on the shape)

**Phase 0 — close the leak, validate input.** Gate `/api/debug/*` in
production (delete the mapillary bbox route), one Vercel WAF rate-limit rule,
finiteness checks, server-side username rule shared with the modal, UUID check
on `?sessionId=`, guard `request.json()`, await the skip DEL. Fix doc drift.

**Phase 1 — command budget + ratchet.** ZINCRBY, drop the top-200 score trim
(unbounded totals, read top 200; kills the ratchet), decide whether the
distance boards earn their 9 commands. Add the two-command daily stats
counter (`HINCRBY stats:date level:band`, `PFADD stats:players:date pid`,
90-day TTL) and a `scripts/stats.mjs` reader. Read the real Upstash meter.

**Phase 2 — small player-facing wins.** Expiry copy, phone header overflow,
stale tooltips, dynamic PanoramaViewer, "explore this spot" link, region-hit
line ("right province, wrong district", free: boundaries are server-side),
static OG image per region.

**Phase 3 — one-round daily + streak + share text, no daily board.** Wordle
shape. A run structure is not a prerequisite; `seededPick(date, n=1)`
extends later. A cookie-farmable daily board is worse than none.

**Phase 4 — Vietnamese correctness.** Accented region names in the tree,
font subset, username regex `\p{L}\p{N}`.

**Phase 5 — measure, then decide.** If fewer than ~20 players/day after
phase 3, the next slice is distribution (Mapillary forum, geography-teacher
groups, the pre-2025-merger geography angle), not more mechanics. Only then:
5-round runs, scoring gradient, board model.

### Recommended defaults for the five decisions (from counsel; override freely)

1. Board model: drop the score trim, unbounded totals, display top 200.
2. Debug routes: gate in production; delete `/api/debug/mapillary`.
3. Identity: localStorage forever; never build a feature that needs trusted
   identity (so no daily board, no duels).
4. Scoring feedback: display-only closeness plus region-hit line; ladder
   untouched.
5. Music: keep default-on, start on Play click or modal close; keydown unlock
   only for Enter/Space.

### Cut entirely

Distance boards (pending decision), daily leaderboard, Upstash limiter,
pipelining-as-budget, challenge-a-friend, duels, panorama movement, curated
landmarks pool, hints-for-points, accounts, Zalo SDK, three-level weekly
fan-out, keyset draw, component tests for now.

### Still unresolved

- Actual visitors/day and Upstash monthly command count.
- Was the debug-route coordinate exposure accepted knowing a live round's
  answer is one lookup away? Recorded decision; needs the maintainer.
- Province boundary GeoJSON size if region-hit runs server-side per guess.
