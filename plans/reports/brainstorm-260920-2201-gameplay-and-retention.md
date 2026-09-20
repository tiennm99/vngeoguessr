# Brainstorm: gameplay, product, retention

Date: 2026-09-20 · Scope: advisory only, no code changed.

## 1. Current state

- Endless single rounds: pick region → one panorama → guess → dialog → Next Round. No run, no end state, nothing to finish.
- One absolute 0-5 ladder (max 1 km). A country round scores 0 unless the player pins the street; province rounds nearly as harsh.
- Leaderboards are all-time cumulative, top 200, username = editable localStorage string; distance board allows many entries per user.
- Retention surface today: "Continue in X" (last region), audio, recent-pano filter, per-visit tally that a reload erases. No streak, no daily, no share, no profile.
- Constraints that shape everything: no accounts, anti-cheat keeps coords/district server-side, Upstash free tier (~25 Redis commands per guess already), Vercel Hobby (no custom analytics events), Mapillary 50k tiles/day at build time only.

**Challenge to the premise before the ideas:** retention work assumes there is traffic to retain. `/game/{region}` page rows in Vercel Analytics are the only traffic signal you have — if DAU is single digits, distribution (Vietnamese social posts, r/VietNam, a landing OG image) beats every mechanic below. Check that first; ideas 2/3 are the ones that also *create* distribution.

## 2. Ideas

### 1. Run structure: 5 rounds, one score out of 25, summary screen
**What:** rounds 1..5 in the same region, running total in the header, end-of-run summary (5 mini-maps, total, best round, "Play again" / "New region").
**Why:** there is currently no unit of play, so there is nothing to complete, nothing to share, nothing to beat. Every other idea here (daily, share, challenge, weekly board) needs a "run" to exist first.
**Effort:** M. **Risk:** client-tracked totals are forgeable — keep runs display-only, keep per-round sessions and the existing fan-out unchanged so anti-cheat and boards are untouched. Second-order: dropout mid-run becomes a metric you cannot see on Hobby analytics.
**Touches:** `GameClient.js` (run state, replaces `sessionRounds`/`sessionPoints`), `RoundResultDialog.js` (round N of 5 + "Next"), new `RunSummary` component. No server change.

### 2. Daily Challenge: same 5 panoramas for everyone, one attempt, streak
**What:** `/daily` — deterministic set of 5 panos per calendar day (materialise once into Redis `daily:YYYY-MM-DD`, 48h TTL), its own board keyed by day, streak counter.
**Why:** the strongest known return-visit loop in this genre (Wordle shape): a reason to open the site tomorrow that does not depend on beating a grinder's all-time total, and a fair comparison because everyone saw the same places.
**Effort:** M-L. **Risk:** one-attempt enforcement rests on the `vng_pid` cookie — trivially bypassed; accept it as casual, do not build anti-cheat for it. Caching resolved Mapillary thumb URLs in the daily key may break (signed URLs expire) — fall back to the normal per-round lookup, ~230 ms, cheap. Cost: +2-3 Redis commands/round.
**Touches:** new `src/app/api/daily/route.js`, `pano-index.js` (seeded pick), `session.js` (mark run kind), `leaderboard.js` (dated key + TTL), home page card, `GameClient.js`.

### 3. Shareable result (emoji squares + Web Share API)
**What:** on the run summary, a copy/share button producing e.g. `VNGeoGuessr Daily #123 — 18/25 🟩🟩🟨⬜🟩 vngeoguessr…`.
**Why:** the only viral loop available at zero infra cost. Also the cheapest acquisition lever in this whole list.
**Effort:** S. **Risk:** must never include coordinates, pano id, or district names — squares and totals only. Second-order: shared links land on `/` cold; pair with a per-day OG image later, not now (OG generation costs Vercel invocations).
**Touches:** new `RunSummary`, small `src/lib/share.js`.

### 4. Partial credit beyond 1 km (decision, not a patch)
**What:** the headline score currently goes to 0 past 1 km, so most country and many province rounds feel identical to a random click on the map.
**Your prior decision:** one absolute ladder for every region, deliberate and documented (`SCORE_BANDS`, features.md) so a point means the same on every board.
**The concern:** the ladder is a *board* rule, but it is also the only feedback the player gets. A 2 km guess and a 400 km guess both read "Missed / 0". No gradient = no sense of improvement = the classic reason a geo game is dropped in three rounds.
**Trade-off / options:**
  a. Keep boards exactly as they are; add a display-only closeness readout below the score (percentile of the region's diagonal, or extra labels "2 km — very close for a country round"). Effort S, zero board impact, zero migration. **Simplest viable.**
  b. Headline score becomes a continuous 0-1000 decay (GeoGuessr-style), boards keep the 0-5 ladder. Effort M; risk: two currencies on screen, needs careful UI.
  c. Replace the ladder with a continuous curve on the boards too. Effort M + migration; reverses the decision and mixes old and new scores on one board — the exact asymmetry you removed once already.
**Recommendation:** (a) now, revisit (b) only if drop-off data says the gradient is still missing. Your call, not mine.
**Touches:** `game.js`, `RoundResultDialog.js`, home page scoring table, `docs/features.md`.

### 5. Weekly board alongside all-time
**What:** `leaderboard:week:{iso-week}` with a ~9-day TTL, shown as a tab beside the all-time board.
**Why:** an all-time cumulative board is unwinnable for anyone who arrives late — it is a wall, not a goal. A weekly reset makes rank renewable and gives a calendar hook.
**Effort:** M. **Risk/cost:** do **not** fan weekly out over three levels. A guess already costs ~25 Upstash commands (12 score + 9 distance + session/history); a 3-level weekly fan-out adds ~12 (+50%) against a free tier measured in hundreds of thousands of commands a month. Country level only: +4.
**Touches:** `leaderboard.js` (key builder, TTL, a second fan-out), `/api/leaderboard`, `LeaderboardModal.js`.

### 6. Distance board: one best entry per user
**What:** today `creditDistance` writes member `username:distance:timestamp`, so a grinder can occupy many of the 200 slots.
**Why:** a board showing one name ten times is not a board; it also suppresses every new player out of visible ranks.
**Effort:** S-M. **Risk:** member encoding changes → must use a new key namespace or the old records become unreadable; the existing `distance:city:` keys should be left in place (same reasoning as the kept prefix).
**Touches:** `leaderboard.js` (`creditDistance`, `getLeaderboard` distance parsing).

### 7. Rank feedback for players outside the top 200
**What:** "Below top 200" is a dead end. Replace with personal best + progress toward the cut ("you need 40 more points to enter Ha Noi's top 200"), which needs only the board's 200th score.
**Why:** the current message tells a new player they are invisible, at exactly the moment the game is asking them to keep going.
**Effort:** S-M. **Risk:** one extra ZRANGE per level per guess unless the cut score is cached (cache it, 60s, in Redis or memory).
**Touches:** `leaderboard.js` (`creditScore`, the `trimmed` branch), `RoundResultDialog.js`.

### 8. "Passport": districts seen, districts mastered
**What:** per-player record of which of the 75 districts they have been shown and the best score in each; a Vietnam map on the home page filling in as they go.
**Why:** long-horizon completionism is the retention mechanic that fits a *national geography* game better than any leaderboard, and it is the only one that makes an unfashionable district worth picking.
**Effort:** M (localStorage version S). **Risk:** localStorage = lost on clear, zero cost, no privacy surface; Redis-by-`vng_pid` = survives but the cookie is deliberately never joined to identity, and a "profile" keyed on it starts eroding that line. Start localStorage.
**Touches:** new `src/lib/passport.js`, home page, `GameClient.js` (record the revealed district post-guess), `regions.js` for the district list.

### 9. Curated "Landmarks" pool
**What:** an offline pass flagging panoramas near named OSM POIs / in dense urban cores; expose as a pool ("Landmarks" vs "Anywhere").
**Why:** a random Mapillary frame in Vietnam is often an anonymous stretch of highway from a dashcam — unguessable and forgettable. Content quality outranks every mechanic here for first-impression retention, and no scoring tweak fixes a boring picture.
**Effort:** L (offline script + a column + a pool filter). **Risk:** build-time Mapillary/Overpass budget; the 50k/day tile cap applies to index rebuilds. Zero runtime cost, which is the appeal.
**Touches:** `scripts/`, pano DB schema, `pano-index.js` (`pickRandomPano` filter), `RegionPicker`.

### 10. Hints that cost points
**What:** optional in-round hints — reveal the province, reveal a compass direction, narrow to a 10 km circle — each deducting from the round's points.
**Why:** turns a hopeless country round into a decision instead of a shrug; reduces 0-score frustration without touching the ladder.
**Effort:** M. **Risk:** hint state and the deduction must live in the Redis session or hints are free information; that is a real change to the session contract and to `/api/guess` scoring. Do not ship alongside idea 4 in the same release — you will not know which one moved the numbers.
**Touches:** `session.js`, new `/api/hint`, `guess/route.js`, `GameClient.js`.

### 11. Challenge a friend (async duel)
**What:** a link encoding a fixed 5-pano set; both players play the same places, results compared on a shared page.
**Why:** highest-intent sharing there is — a friend invite converts far better than a public score post.
**Effort:** L. **Risk:** needs a challenge store, a result store, and a results page; identity is still a localStorage name, which is fine among friends but not ranked. Same machinery as the daily (idea 2) — build the daily first and this becomes M.
**Touches:** new challenge lib + routes + page, `GameClient.js`.

### 12. Vietnamese UI (vi default, en toggle)
**What:** ~40-60 strings in one dictionary module, a tiny `t()` hook, language stored in localStorage, `lang` on the html element.
**Why:** the game is about Vietnamese streets, the audience is Vietnamese, the UI is English. This caps both reach and shareability on Vietnamese social — where the sharing from idea 3 would actually happen.
**Effort:** M, no library (a plain JS dict fits the JS-only rule; `next-intl` would be over-engineering at this size). **Risk:** string drift between the two locales; metadata/title per region page needs a locale too, and static rendering of 85 region pages must not become dynamic.
**Touches:** new `src/lib/i18n.js` + dict, every component with copy, `layout.js`, region page metadata.

### 13. Post-round "explore this spot"
**What:** after the guess, link the revealed coordinates to Google Maps / OSM (and optionally the Mapillary image page — safe *only* after the guess, and the answer is already in the response).
**Why:** curiosity payoff; "where the hell was that?" is the moment people actually learn something, and learning is what makes a geo game sticky. Costs nothing.
**Effort:** S. **Risk:** must be strictly post-guess and never in the share text.
**Touches:** `RoundResultDialog.js`, and `guess/route.js` only if you want the pano id (coords alone are enough).

## 3. Top 3

**1 — Run structure + shareable summary (ideas 1 + 3, ship together).** M effort, no server change, no cost. It creates the unit of play everything else needs and simultaneously gives you the only free acquisition channel. Without it, "come back" has nothing to come back *to*: a session of endless identical rounds ends when attention ends, never at a satisfying stopping point.

**2 — Daily Challenge + streak (idea 2).** The return-visit engine. Fair by construction (same 5 panos for all), self-marketing through idea 3's share string, and cheap: one materialised Redis key per day plus a dated board with a TTL. Depends on #1, which is why it is second, not first.

**3 — Fix the feedback gradient (idea 4a) plus rank feedback (idea 7).** Both are S/M, both attack the same wound: the game tells a mediocre player nothing except "0" and "below top 200". Option (a) keeps your one-ladder decision intact and adds only display, so it is reversible in a single commit — take that before considering any board-level scoring change.

**Simplest viable option overall:** idea 13 + idea 3's share text + idea 4a. All three are S, none touches the server, none costs a Redis command, and together they change what a round *feels* like. If you want one afternoon of work with the best ratio, that is it.

**Explicitly not in the top 3, and why:** curated landmarks (9) is probably the highest *ceiling* — content beats mechanics — but it is L, offline, and slow to validate. Weekly boards (5) are good but cost Redis commands on a free tier. Vietnamese UI (12) matters for reach, not retention, and belongs with a distribution push, not before one.

## 4. Unresolved questions

1. **Is there traffic?** What do the `/game/{region}` page rows actually show — visitors/day, and repeat rate? If it is <20/day, do idea 3 + a distribution push before any retention mechanic.
2. **Identity.** Any competitive feature (weekly, daily board, duels) is built on an editable localStorage name. Accept casual/forgeable boards forever, or introduce a lightweight account (OAuth, passkey) at some point? This decision gates ideas 2, 5, 11 and should be made before, not after.
3. **Upstash headroom.** What is the actual monthly command count today? ~25 commands per guess is the hard budget constraint on ideas 2, 5, 7 and 8, and nothing here is sized without that number.
4. **Do Mapillary thumb URLs expire?** Determines whether a daily set can be cached with its image URLs or must re-resolve per player (affects idea 2's latency, not its feasibility).
5. **Who is the player?** Vietnamese locals, diaspora, or foreign geo-game players? Locals → idea 12 and landmark curation; foreigners → the country mode's harshness (idea 4) matters much more.
6. **How harsh is country mode really?** What share of submitted guesses score 0? That single number decides whether idea 4 is cosmetic or urgent, and it is currently unmeasurable — a minimal server-side counter (one Redis INCR per score band) may be worth the commands.
