# Red team: the improvement roadmap

Date: 2026-09-20 · Target: [synthesis-260920-2201](synthesis-260920-2201-improvement-brainstorm.md)
Adversarial review only; no code or report touched. Items marked *verified* were checked against the live
deployment with read-only GETs.

## 1. Objections, ranked

### O1. Phase 1 files a live answer leak under "budget hygiene"

Attacked: debug routes framed as a metered-cost problem (§4; decision 2, "coordinate exposure was an accepted
decision; the metered-cost side is new"). Verified in production today:
- `/api/debug/region-coverage?region=DN-HAICHAU` → `panos: [{id, lat, lng}]`, `counts.sampled: false` — the
  whole district; `limit` up to 40000/request (`region-coverage/route.js:12`), so the 424k index is a bbox
  loop away, on Neon's clock.
- `/api/debug/pano?id=<id>` → `{id, url, isPano, lat, lng}`. The answer, unauthenticated, one request.
- The `thumb_2048_url` path token is **stable per image**: two calls for id `1284766110014772` returned the
  same `…/m1/v/t6/An-jWH25A722V1ve…` path, differing only in the query signature. So the synthesis's open
  question ("does the URL embed the id") answers *no* — but a stable path is an equivalent identifier.
  Precompute path→coords for a district (172 requests here), then read any live round's answer off its URL.

The accepted decision was "coverage data is public". What shipped is "the live round's answer is one lookup
away", voiding the server-side session, the secret `regionCode`, the single-use `DEL` and server-only
`pano-history.js` — the whole complexity budget this codebase spends on anti-cheat. Alternative: gate
`/api/debug/*` on an env check in Phase 0, ahead of the ZINCRBY cleanup. Cheapest item on the list.

### O2. The daily's board is free to farm, and it poisons the all-time boards

Attacked: phase 4's dated board and "accept it as casual, do not build anti-cheat". One-attempt rests on
`vng_pid`, which the server mints on demand (`new-game/route.js`: `readPlayerId(request) ?? newPlayerId()`):
clear cookie → new identity → replay with known answers, and with O1 unfixed no replay is needed at all. The
fan-out is also unconditional (`submitRoundScore` → `ancestorsOf`), so daily rounds credit the
district/province/country all-time boards too. "Same panoramas for everyone" means one precompute serves every
player and every level. Alternative: ship the daily **without a leaderboard**. Wordle — the precedent the
research report leans on — has none; the loop is streak + share. That deletes the farm target, the dated-board
fan-out and the identity question (decision 3) from the critical path, for less code. A board later must skip
the all-time fan-out, a `pointsFor`/`ancestorsOf` change nobody has scoped.

### O3. A 5-round run is not a prerequisite for the daily or the share text

Attacked: "5-round run → share text → daily + streak. Same machinery, in that order"; "depends on #1, which is
why it is second". Asserted, never argued. Wordle is one puzzle a day. A one-round daily needs a date-seeded
`pickRandomPano`, the existing round flow and a share line (`VNGeoGuessr #123 · 240 m 🟨 · vngeoguessr…`): no
run state, no summary component, no forgeable client total. 27 Redis commands against ~135 per run (§3), and
`seededPick(date, n=1)` extends to `n=5` later without rework. Alternative: one-round daily + streak + share
first; the run structure once the daily proves anyone returns. That defers the largest client change in the
plan (new component, replaces `sessionRounds`/`sessionPoints`), today justified only by features that are
themselves unvalidated.

### O4. The rate limiter spends the budget it protects, and names a deprecated file

Attacked: phase 1, "one `middleware.js`… `@upstash/ratelimit`".
- 2-3 Upstash commands *per request*, against the same 500K/month budget §4 calls the binding constraint: a
  ~10% tax per round plus a tax on requests that would have cost nothing.
- It runs after admission, so it never saves the Vercel invocation it is meant to protect.
- Next is 16.3.3. `middleware.js` is the renamed/deprecated convention; the file is `proxy.js` exporting
  `proxy`, it runs on **Node** (edge unsupported there), and a leftover `middleware.js` can be ignored at build
  time with no error — the exact mode where a security control silently stops running.

Alternative: Vercel Firewall. Hobby allows one rate-limit rule plus three custom rules; blocked requests never
reach a function and do not count toward usage — cheaper, earlier in the path, zero application code. Keep
`@upstash/ratelimit` in reserve for a per-`vng_pid` rule the WAF cannot express, which, if O2 is accepted, may
never exist.

### O5. Distance boards cost a third of the round budget and nobody defends them

Attacked: the roadmap debates *which* score model and never asks whether the distance board should exist.
`submitDistanceRecord` is 3 commands × 3 levels = 9 of ~27 per round. Gameplay idea 6 says one grinder occupies
many of the 200 slots; UX L3 says players cannot tell the two board types apart; `creditDistance` packs
`username:distance:timestamp` into the member — the exact string that breaks on a `:` in a username.
Alternative: delete them, or keep country level only (9 → 3). With ZINCRBY (−3) and reusing the history array
`new-game` already read instead of re-reading it inside `recordPanoId` (−1), a round drops 27 → ~14. *That* is
what pays for a five-round run; Phase 1 as written does not fund Phase 3.

### O6. "Display-only readout" is half a dodge, and a better answer sits in the same reports

Attacked: §3 / gameplay 4a as "simplest viable". It is honest about not reversing a recorded decision, and a
dodge on mechanism: a percentile-of-region-diagonal label beside a headline `0` is the same "two currencies on
screen" problem the roadmap rejects in 4b, only qualitative — and a region-diagonal percentile is a number no
player has intuition for. Alternative: the UX report's forward idea 1, region-hit ("right province, wrong
district") — geographic, on-subject, no second currency, and nearly free, since `REGION_BOUNDARIES` is already
server-side (`region-coverage/route.js:2`) and resolving the *guess* inside `/api/guess` is CPU only. Add one
ladder-derived line ("240 m — 40 m from 2 points"), computed from `SCORE_BANDS` so it cannot drift.

### O7. "Vietnamese UI is reach not retention" — the product reads as foreign-made

Not only UI strings. Every region name in `src/data/regions/index.js` is unaccented ASCII (`"Ha Noi"`, `"Ba
Dinh"`, `"Hoan Kiem"`); `Hải Châu` spelled `Hai Chau` is the tell that a product was not built for this
audience, and OSM's `name:vi` makes fixing it a `scripts/` change, not a translation project. `layout.js:13,18`
loads the `latin` subset only, so diacritics would fall back even with the data fixed. `UsernameModal.js`
rejects `Tiến` (UX M4): the game refuses Vietnamese names, which is retention, not reach. Second-order: the
roadmap's acquisition plan is a share string landing in Zalo and Facebook, so language multiplies that
string's conversion and sits *in* Phase 3's path, not after it. Alternative: skip full i18n; do the three
correctness fixes (`name:vi`, `vietnamese` font subset, `\p{L}` usernames) and write new copy Vietnamese-first.

### O8. Three smaller corrections

- **Pipelining is latency work, not budget work.** Upstash bills per *command*; a pipeline of N still counts N.
  Under "edge + budget" it makes Phase 1 look like it funds Phase 3. Only removing commands does (O5).
- **Thumb URLs do not expire quickly (verified).** A live URL's `oe` decodes to 2026-10-20, ~30 days out: a
  daily set can cache resolved URLs for its 48h TTL and the planned expiry fallback is unnecessary — but a URL
  handed to a client stays fetchable for a month, so a share card built from one is a month-long artifact.
- **The reports disagree on share-text contents.** Synthesis: "no coords/pano id/district". UX idea 4:
  `VNGeoGuessr · District 7 · 4/5 · 87 m · /game/tphcm-q7`. Merged without naming the conflict; the
  synthesis's rule is the safe one and belongs written down, region slug included.

## 2. Assumptions nobody verified

1. **That there is traffic.** Every phase after 0 is sized for a game with players; the gameplay report flags
   it and the roadmap then sequences as if it had been answered.
2. **That the 200-place ratchet has ever bitten.** Nobody read `ZCARD leaderboard:vietnam` or the 200th score.
   If the board holds 40 entries, the decision blocking Phase 2 is hypothetical and the phase deletes rather
   than resolves. Likewise "~18.5K rounds/month" is a division, not a reading of the Upstash or Neon meters.
3. **That a 5-round run is what "no unit of play" needs.** Four reports agree with each other; none cites a
   player. Four agents reading one repo is not corroboration.
4. **That runs stay client-side and still feed a daily board.** A forgeable client total plus a board is a
   contradiction the roadmap holds in both hands.
5. **That i18n keeps static rendering, and that OG is free.** A localStorage locale leaves `generateMetadata`
   — every share preview — in English, defeating the reason for doing it; a cookie/header locale makes all 85
   pages dynamic. Nobody picked a horn. Static `openGraph` tags are free; a per-day OG *image* is not.

## 3. Hidden costs the phases do not price

| Change | Redis cmds | Other |
|---|---|---|
| Today, per round | ~27 (new-game 4, guess 23) + 4 per prefetch, often wasted | 1 Neon query, 1-3 Mapillary lookups |
| 5-round run | ~135 per run | 5× Neon + Mapillary per visit |
| Daily + board + streak | +4 board, +2 streak, +1 set read per run | 5 Neon picks/day, once |
| `@upstash/ratelimit` | +2-3 **per API request**, rejected ones included | — |
| Weekly board (country only) / rank-to-cut | +4 / +1-3 unless cached | — |
| O5 cuts | **−13** | — |

At 500K/month: ~18.5K rounds today, ~3.7K five-round runs. A hundred daily players doing one run each is ~13.5K
runs/month — over budget. With O5 a run costs ~70, giving ~7.1K. Budget work is not hygiene *before* the
feature; it is its precondition. Nothing breaks static rendering of the 85 region pages except the i18n horn in
§2.5; `/daily` as a new dynamic route is fine.

## 4. Constraint conflicts

- `middleware.js` on Next 16 (O4): wrong convention, silent-failure mode. Confirm against the Next docs shipped
  inside the installed package, per CLAUDE.md, before writing either file.
- `.github/workflows/*` in Phase 0 is configuration; project CLAUDE.md says config changes get highlighted for
  manual processing, not committed quietly.
- Phase 3's "explore this spot" must link coordinates, never the Mapillary per-image page (`docs/features.md`
  records the rule; O1 shows why). Nothing else forces TypeScript, non-npm tooling, or browser automation.

## 5. Revised sequence

The original does not survive: 0-1 are right in spirit and wrong in content; 3 and 4 are inverted.

- **Phase 0 — stop the bleeding.** Gate `/api/debug/*` in production (O1); one Vercel Firewall rate-limit rule
  (O4); NaN / username / `sessionId` validation. Reversible, costless, no product decision.
- **Phase 1 — pay for what comes next.** Distance boards cut or country-only, ZINCRBY, reuse the history read
  (O5): 27 → ~14, while reading the real Upstash and Neon meters. Then dynamic `PanoramaViewer`, stale
  tooltips, expiry copy, header overflow.
- **Phase 2 — one-round daily + streak + share, no board** (O2, O3). The whole return loop at one round of
  cost, new copy Vietnamese-first.
- **Phase 3 — Vietnamese correctness** (O7): decides whether Phase 2's share string works where it is shared.
- **Phase 4 — measure, then decide.** Only if people returned: five-round runs, region-hit gradient (O6), and
  the leaderboard model — never as a *blocking gate*, since it blocks nothing once the daily has no board.

## 6. Cut entirely

1. **Distance leaderboards** (O5) — a third of the round budget, broken, defended by nobody.
2. **The daily leaderboard** (O2) — keep the daily, drop the board.
3. **`@upstash/ratelimit` middleware** (O4) — replaced by a firewall rule.
4. **Pipelining as a budget line** (O8) — do it for latency, if at all. **Phase 2 "decide the board"** as a
   phase, too: one `ZCARD` from being a non-question.
5. **The percentile closeness readout** (O6), for region-hit.
6. **"Challenge a friend"** — L effort, same forgeable identity, a third acquisition mechanic proposed before
   the first is measured.

## 7. Unresolved questions

1. `ZCARD` and 200th score on `leaderboard:vietnam` and the biggest district board — ratchet live or
   theoretical? Upstash commands/month, Neon compute hours, `/game/{region}` visitors/day?
2. Was the `debug/*` exposure accepted with O1's live-round consequence understood, or only as "coverage data
   is public"? A recorded decision, so the maintainer's call; the new evidence is the stable CDN path token.
3. Does Hobby's single rate-limit rule support the key and path scope needed, and fire before the function runs?
4. If the distance boards are cut: delete the keys, or leave them orphaned the way `leaderboard:city:` was kept?
