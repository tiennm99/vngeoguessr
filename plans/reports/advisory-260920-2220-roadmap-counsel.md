# Roadmap counsel — what to build next (2026-09-20)

Independent read of `synthesis-260920-2201` and its four reports, `docs/`, `CLAUDE.md`, and 163
commits of history. Advisory only. (verified) = checked against source; the rest is judgment.

## TL;DR

One two-week slice: **half a session of hygiene that also kills the leaderboard ratchet and adds a
two-command daily stats counter, then the 5-round run + summary + share text + closeness readout.**
Defer the daily challenge until the counter has two weeks of baseline. Realtime, offline-curated and
account-shaped work is off the table at this scale. The framing all four reports missed: the project
is *pre-revenue with a recorded "donation now, ads later" direction*
(`plans/260906-1057-game-analytics-events/plan.md:42`), so it is a distribution problem before it is a
retention problem — and its two distinctive assets (pre-merger district geography, honest Mapillary
coverage) are the distribution wedge.

## Cadence reality check

`git log` is not "one feature every few days". It is weekend bursts: 32 commits on 08-30, 16 on 09-01,
11 on 09-06, 3 on 09-09, then 11 days of nothing (verified), and roughly a third are `docs(plans)`
records. Two weeks means **two or three working sessions**. Plan two features, not five.

## 1. The next 2-week slice

**Session A — hygiene + ratchet + counter (one sitting).**
- `guess/route.js`: `Number.isFinite` on all four coordinates before the session DEL (review H3);
  server-side username rule shared with the modal (H4 — put the regex in the existing
  `src/lib/username.js`, which today only owns storage); UUID test on `?sessionId=` (M4).
- `leaderboard.js` `creditScore`: ZSCORE+ZADD → ZINCRBY and **delete the trim** (decision 1). The
  ratchet at `leaderboard.js:135-143` (verified) disappears as a side effect; 4 → 2 commands per level.
- One `middleware.js`: 404 `/api/debug/*` and `/debug/*` when `VERCEL_ENV === 'production'` unless a
  shared-secret header matches. Delete `/api/debug/mapillary` and `/debug/bbox` outright —
  `mapillary.js:228-234` already documents why that call must not exist.
- UX: expiry copy carries the server reason (UX H3), header overflow below `sm` (UX H1), stale "own
  scale" tooltips (UX M3), `dynamic()` PanoramaViewer (M7).
- The stats counter from section 5 — ship it *first* in the session so baseline starts.
- Doc drift: `README.md` and `docs/features.md` say 5 provinces / 61 districts; `docs/project-overview.md`
  says 9 / 75 (verified). Ten minutes.

**Sessions B–C — the unit of play.** 5 rounds in one region, running total in the action bar (not the
header — that is what overflows), summary screen, share text (squares + total + `/game/{region}` URL; no
coords, pano id or district), display-only closeness line under a 0-point score ("2.3 km — right
province" when the guess lands in the panorama's province; ladder untouched), "explore this spot" link
post-guess. Per-region OG title/description already exists via metadata; add one static OG PNG (no
`ImageResponse` invocations).

**Defer, explicitly:** daily challenge (slice 2, after baseline), weekly boards, passport, Vietnamese UI
(ship it with the first deliberate distribution push, not before), general `/api/*` rate limiting
(section 3), CI (20 minutes when bored — the gates already run locally every burst), keyset random draw
(M8), GameClient split, component tests, dependency bumps.

**Why this over the alternatives.** Hygiene first because three fixes are 500-class failures a shared
link would trip on, and the ratchet means every player after the 200th cannot accumulate — a retention
bug already in production. Run+share over daily because a daily *needs* a run, a share and an
audience; with unknown DAU a dated board is an empty room. Run+share over Vietnamese UI because the run
is the object you would localise; localising endless rounds is localising the wrong thing.

## 2. Defaults for the five maintainer decisions

1. **Leaderboard → drop the score-board trim, keep unbounded totals, read top 200.** Trim buys nothing
   at ~100 bytes per member and costs a command plus a correctness bug. Weekly boards: not until the
   daily ships and the counter shows >50 players/day. Keep the distance-board trim (multi-entry per user).
2. **Debug routes → gate in production, delete `/api/debug/mapillary`.** Coordinate exposure was
   accepted knowingly; metered Neon/Mapillary cost is new evidence, and the coverage inspector is a
   maintainer tool.
3. **Identity → localStorage names forever, no accounts.** The `vng_pid`/username separation is a real
   privacy stance; accounts add auth code, a privacy surface and support load to a zero-revenue
   project. Consequence: never build a feature whose value depends on trusted identity (ranked duels,
   prizes).
4. **Scoring feedback → 4a display-only closeness + region-hit line.** One reversible commit, keeps the
   recorded one-ladder decision, and "right province, wrong district" is the Vietnam-specific gradient
   no continuous curve gives you.
5. **Music → keep default-on; start on the Play click or when the welcome modal closes; unlock on
   `keydown` only for Enter/Space.** Preserves the decision, removes the mute-hidden-behind-a-scrim trap.

## 3. Wasted effort vs underrated

**Wasted at this scale:** realtime duels and lobbies (hosting-model change); Mapillary movement
(multiplies calls against the same 50k/day budget the index build needs); curated landmarks pool
(highest ceiling, but L, offline, unverifiable without traffic); hints that cost points (changes the
session contract and confounds the scoring readout); lightweight accounts; Zalo SDK or Mini App (plain
links + OG do the job); PostHog (a second script before a first audience); weekly/dated boards fanned
over three levels; keyset draw and Neon indexes before Neon compute shows pressure; sliding-window rate
limiting on every route — 1–2 Redis commands per request to guard a quota nobody is attacking yet; the
debug gate is the cheap 80%. Revisit when the counter shows traffic or Upstash's dashboard shows abuse.

**Underrated:** the ratchet fix (a retention bug in a data-model costume); "explore this spot" (S, zero
cost, the one learning moment in the loop); region-hit feedback (boundaries already ship in
`src/data/boundaries/`, turf is already a dependency — check payload size before importing on the server
path); the phone header overflow (most common device, controls clipped after round one); a static OG
image per region (the actual Zalo/Facebook lever); the doc drift; and the measurement below.

## 4. The framing the reports missed

- **Pre-revenue, not zero-revenue.** The Beer button and `plan.md:42` record "donation now, ads later".
  Ads need pageviews; pageviews need distribution. That reorders the roadmap: share text, OG,
  Vietnamese UI and a posting plan outrank any return loop.
- **A geography-learning game about districts that no longer officially exist.** Pre-2025-merger
  boundaries (Da Lat under Lam Dong, Duc Hoa under Long An) are a deliberate, documented stance. Lean
  in: the reveal that names the district, the region-hit line, a later passport make it "học địa lý
  qua ảnh đường phố" — a pitch for Vietnamese geography/teacher Facebook groups and r/VietNam, and a
  far stronger share hook than a score.
- **A Mapillary Vietnam coverage showcase.** The three-cause coverage taxonomy, "few streets" labels
  and coverage inspector are already half a coverage map. A disabled district can read "no street
  imagery yet — capture it with the Mapillary app" (zero cost), and forum.mapillary.com is a free
  channel the research brushed past (MapiGuesser got a post there). It turns the weakest content —
  sparse rural districts — into a community ask instead of a defect.
- **Portfolio value is already banked** (292 tests, ADR-style decisions, honest docs); do not let
  polish crowd out the play loop — a portfolio piece with no unit of play is a demo.

## 5. The one measurement before any retention work

**A daily stats hash in the Redis you already have.** On each successful `/api/guess`:
`HINCRBY stats:YYYY-MM-DD "<level>:<band>" 1` (level = country|province|district played, band = 0..5)
and `PFADD stats:players:YYYY-MM-DD <vng_pid>`. Two commands per round — net cheaper than today after
the ZINCRBY/trim change. Set a 90-day TTL only when HINCRBY returns 1 (first write of the day). Read
with `scripts/stats.mjs` printing the last 30 days: rounds/day, distinct players/day (PFCOUNT), rounds
per player, zero-score share per level, and 7-day repeat rate from PFCOUNT over seven keys versus their
sum (union < sum means returners). Needs `hIncrBy`/`pfAdd`/`pfCount` in `src/lib/upstash.js` and in
`tests/fake-upstash-redis.js` (neither has them, verified). Why not the `console.log` at
`guess/route.js:93-102`: Hobby runtime logs live about an hour (belief, medium confidence), and that
line writes username plus exact coordinates — trim it to distance, band and level while there (L1).

Decision rule this buys: if distinct players stay < ~20/day after run+share ships and one posting
round, the next slice is distribution (Vietnamese UI, OG image, Mapillary forum, geography groups), not
the daily challenge.

## Assumptions

- Traffic is small (single/low-double-digit DAU). High confidence: no quota incident anywhere in
  reports or journals. A Vercel/Upstash dashboard check near 18K rounds/month flips the slice to budget
  work.
- Two weeks = two or three sessions. High confidence from commit history.
- "Ads later" still stands. Medium; if dropped, soften the distribution emphasis but keep the order.
- Mapillary thumb URLs expire. Medium; affects only the deferred daily's caching.

## Unresolved questions

1. Actual `/game/{region}` rows and rounds/month in the Vercel and Upstash dashboards — the only numbers
   that could reorder this slice.
2. Does `thumb_2048_url` embed the image id? If yes, the debug gate is also the anti-cheat fix.
3. Is the Beer/donation button seeing any clicks? A zero there is itself a distribution signal.
4. Province boundary GeoJSON size if region-hit runs server-side per guess — may need simplified
   polygons or nearest-district-centroid instead.
