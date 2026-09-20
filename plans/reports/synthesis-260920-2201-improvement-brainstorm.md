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
