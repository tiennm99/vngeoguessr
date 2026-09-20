# Geo-Guessing Game Landscape — Research for VNGeoGuessr Brainstorm

Scope: what GeoGuessr/clones offer that VNGeoGuessr lacks, filtered to zero-cost
feasibility on the current stack (Next.js, Vercel-style hosting, Redis, Mapillary,
no accounts).

## 1. Feature Matrix

| Feature | GeoGuessr | WorldGuessr (OSS) | GeoHub (OSS) | VNGeoGuessr today |
|---|---|---|---|---|
| Single-round click-to-guess | Yes | Yes | Yes | Yes |
| Movable panorama (walk/pan sequences) | Yes | Yes (Google embed) | Yes (Google) | **No** — fixed single panorama, no Mapillary sequence traversal |
| Distance-based scoring | Yes (5000-pt curve) | Yes | Yes | Yes (0-5 ladder, absolute distance) |
| Daily Challenge (same seed for all players) | Yes, global leaderboard [Wikipedia][gg-wiki] | No | **Yes** [geohub-repo] | No |
| Streak counter (daily return) | Yes ("Daily Streak") [geoguessr-changelog] | Country-streak only (in-round, not daily) | Country-streak only | No |
| Duels (1v1 real-time, HP-based) | Yes, core competitive mode [shapes-modes] | No | No | No |
| Party/multiplayer lobby | Yes | Yes, real-time | Challenge-link async only | No |
| Shareable challenge link ("play same rounds") | Yes | No (README silent) | **Yes** — "create a challenge link...share with friends" [geohub-repo] | No |
| Shareable result card (Wordle-style text) | No native (screenshots shared informally) | No | No | No |
| Custom user-made maps | Yes | No (README silent) | Yes | No (region tree is fixed/authored) |
| User accounts / profiles | Yes | Optional | Yes (guest login too) | **No** (by design — cookie-only) |
| Leaderboards | Yes | Unclear | Yes | Yes (rollup: district/province/country) |
| Imagery source | Google Street View | Google Street View Embed API | Google Street View | Mapillary (CC BY-SA) |
| Hosting/API cost model | Paid product | Free (Google Embed API has no key cost) [worldguessr-repo] | Donations + user's own Google key ($200/mo free credit) [geohub-repo] | Free tier (Vercel + Neon + Redis + Mapillary) |

Notes: WorldGuessr and GeoHub both lean on Google's **Street View Embed API**
(not the paid tile/SDK API) to stay free — a different cost trick than
Mapillary, not directly transferable. Neither is Mapillary-based; the closest
Mapillary-based prior art is MapillaryGeoGuessr and MapiGuesser, both small
single-purpose demos with no daily/duel/multiplayer features documented
[github-mapillarygeoguessr][mapiguesser].

## 2. Findings by Research Question

### Q1 — Game modes and their backend needs

- **Daily Challenge**: same N locations for every player in a UTC day, one
  global leaderboard [gg-wiki]. GeoHub implements this as an actual mode
  [geohub-repo]. **Needs no new backend** beyond what VNGeoGuessr already has:
  derive a deterministic seed from `UTC date + region`, use it to pick N
  panorama ids reproducibly from the existing Postgres index, and write scores
  to a Redis sorted set keyed by date (`leaderboard:daily:<region>:<date>`),
  same pattern as current rollup boards.
- **Streak (daily return) counter**: GeoGuessr's mechanic is "play something
  today to keep the streak" [geoguessr-changelog]. Client-only or
  cookie+Redis (`vng_pid` → last-played-date, streak count) — trivial, no new
  infra.
- **Country/region streak (in one sitting, lose on first miss)**: pure
  client+existing session flow; no new infra.
- **Duels (1v1 real-time HP battle)**: core GeoGuessr competitive mode
  [shapes-modes]. Requires low-latency bidirectional state (matchmaking,
  simultaneous-round sync) — effectively WebSockets or a polling loop against
  Redis pub/sub. Serverless HTTP functions (Vercel-style) do not hold
  persistent connections, so this needs either a small persistent Node process
  (defeats "free-tier serverless" hosting) or a third-party realtime free tier
  (e.g. Pusher/Ably free plan, rate-capped). **Not zero-effort; feasible only
  as a stretch item.**
- **Party/multiplayer lobbies**: same realtime constraint as Duels. WorldGuessr
  implements this because it runs a persistent Node server, not
  serverless [worldguessr-repo] — a hosting-model difference from VNGeoGuessr.
- **Shareable challenge link** ("play the exact rounds I played"): GeoGuessr
  and GeoHub both offer it [gg-wiki][geohub-repo]. Async, no realtime — just
  persist the round's panorama-id list under a short code in Redis (TTL is
  fine) and let a link `?challenge=<code>` replay it. **Cheap, feasible now.**
- **Shareable result card** (Wordle-style emoji/text grid): not a feature of
  GeoGuessr itself but is the single highest-leverage viral mechanic in this
  genre (see Q3). No backend need — pure client-side string generation from
  the result already in hand.
- **Moving/walkable panorama**: GeoGuessr, WorldGuessr, and GeoHub all allow
  moving between connected Street View panoramas [worldguessr-repo]
  [geohub-repo]. VNGeoGuessr currently shows one fixed Mapillary image with no
  sequence traversal (confirmed: no sequence/adjacency code in
  `src/lib/mapillary.js` or `PanoramaViewer.js`). Mapillary's API does expose
  sequence membership and neighboring image ids, so "move" is technically
  buildable, but each move is an extra Mapillary API call per player action —
  directly multiplies API usage against the 50k/day tile cap noted in
  `docs/project-overview.md`. Feasibility is capped by that budget, not code
  effort.

### Q2 — Imagery cost/licensing across clones

- **Google Street View Embed API** (WorldGuessr, GeoHub): free without a
  billing-enabled key for the embed/photosphere viewer, which is why both
  clones can be "zero cost" on imagery — but this is a Google product
  decision, not something Mapillary offers, and pulling it into VNGeoGuessr
  would mean adding a second imagery source and licensing regime, contradicting
  the project's current single-source Mapillary + CC BY-SA design
  (`docs/features.md` attribution section). Not recommended as a copy-paste
  idea; noted only as "why they're free."
- **Mapillary Terms of Use** [mapillary-terms]: requires visible Mapillary
  logo + link back to the Mapillary **homepage** (not per-image) when
  displaying data derived from their API/vector tiles — VNGeoGuessr already
  does this correctly per `docs/features.md`. ToU prohibits apps that "merely
  redistribute Content or create applications that substantially replicate
  the functionality of Mapillary Services" without materially supplementing
  them — a geo-guessing game (a materially different use case) sits on the
  safe side of that line, same conclusion the project has already reached.
  ToU does **not** publish a numeric caching duration for image bytes; the
  project's own prebuilt-index + on-demand `fetchPanoramaById` approach
  (cache ids, not bytes, fetch fresh URLs at play time) already matches
  observed community guidance that thumbnail URLs are TTL'd and should be
  refetched rather than stored long-term [mapillary-forum-cache].
- **Rate limit**: documented 50,000 requests/day, scope (per token vs per
  account vs global) is disputed even in Mapillary's own community forum
  [mapillary-forum-limit] — the project's own docs already treat this as a
  hard budget for boundary/index rebuilds. Any new feature that adds
  per-round Mapillary calls (e.g., movement, live search) competes with that
  same budget and should be evaluated against it explicitly.
- **KartaView**: also CC BY-SA, community-run (now under Grab), similar
  attribution model to Mapillary but far lower Vietnam coverage in practice;
  a viable *secondary* source to backfill gaps, not a replacement.
- **Panoramax** (IGN France / OSM France): fully open-licensed pipeline (not
  just the images) [tzovaras-panoramax], positioned as the ideological
  alternative to Mapillary/KartaView's proprietary backends — but its public
  instances are France-focused; **no meaningful Vietnam coverage today**, so
  not usable for this project despite the cleaner license.
- **Wikimedia Commons panoramas**: no evidence found of any clone using
  Commons as a panorama source at scale — Commons has scattered 360°
  photospheres, not a queryable street-level network, so it's unfit as a
  systematic input; could only ever supplement specific landmarks manually.

### Q3 — Viral/retention mechanics

- **Wordle's model** is the reference case: one puzzle/day (scarcity →
  anticipation → shared daily moment), a spoiler-free emoji share grid that
  works on any platform, and a streak counter that is visible but not
  punishing (breaking it just resets a number) [hackernoon-wordle]
  [historytools-wordle]. McKinsey-cited modeling shows >70% Wordle retention
  at 10 months post-adoption vs 20-30% for typical social apps at the same
  horizon [historytools-wordle] — the standout number in this space, though
  it is one secondary citation of an unpublished model, not a primary source;
  treat as directional, not precise.
- **TimeGuessr** extends the "daily, shareable, same-for-everyone" pattern
  into geo-guessing specifically: 5 daily rounds, new photos added daily,
  shareable rounds, friend leaderboard comparison [eraguessr-timeguessr]
  [gigazine-timeguessr] — closest genre-analog to what a VNGeoGuessr daily
  mode could look like.
- **Mechanism common to all three** (Wordle, GeoGuessr Daily, TimeGuessr):
  same seed for every player + a compact copy-pasteable result. This is the
  one mechanic in the whole research set that is (a) proven across three
  unrelated products, (b) zero marginal backend cost, and (c) directly
  portable to VNGeoGuessr's existing Redis leaderboard pattern.

### Q4 — Vietnam-market specifics

- **Zalo**: Vietnam's #2 social platform after Facebook, ahead of YouTube in
  2025 usage rankings [salesmartly-zalo]; run by VNG (the user's employer,
  incidentally — no special access implied, just the market-share fact). Zalo
  supports timeline sharing and has a "Mini Game" surface for
  brands/interactive content [salesmartly-zalo], but that Mini App/Mini Game
  platform requires developer registration with Zalo's OA (Official Account)
  program — a real integration project, not a free `?share=` link. A **plain
  web link shared into Zalo chat/timeline** (like any URL) needs no
  integration at all and is the pragmatic zero-cost option; Zalo will render
  Open Graph tags for a link preview same as Facebook/Twitter, so investing
  in correct OG image/title tags for a result page is the actual lever, not a
  Zalo SDK.
- **No evidence found** of a comparable general-audience Vietnamese
  geo-guessing or geo-trivia web game (searched Vietnamese-language queries
  directly). One informal community reference — "ViGuessr" — surfaced only as
  a Facebook group post title, with no live product, GitHub repo, or further
  detail found [viguessr-fb]; treat as an unverified community mention, not a
  competitor to analyze. GeoGuessr itself ships an official "Vietnam" map
  played on their platform [gg-vietnam-map], and Vietnamese gaming forums
  (Tinhte) discuss playing GeoGuessr generally [tinhte-geoguessr] — this
  establishes player demand/familiarity with the genre in Vietnam, not a
  Vietnamese-made competing product.
- **Language**: no direct evidence gathered on Vietnamese-specific UI
  copy conventions for this genre specifically (see Unresolved Questions).

## 3. Feasible Feature Ideas — Ranked by Impact vs Effort (zero-cost constraint)

| # | Feature | Impact | Effort | Why |
|---|---|---|---|---|
| 1 | **Daily Challenge** (fixed seed per UTC day, per region, own leaderboard) | High | Low | Direct precedent (GeoGuessr, TimeGuessr, GeoHub) [gg-wiki][eraguessr-timeguessr][geohub-repo]; reuses existing Redis sorted-set + Postgres index pattern; no new infra |
| 2 | **Shareable result text** (score + distance ladder as compact copy-paste, e.g. emoji per round) | High | Low | The single most evidence-backed retention mechanic in the genre [hackernoon-wordle]; pure client-side string build from data already returned by `submitRoundScore` |
| 3 | **Daily streak counter** (cookie/`vng_pid` + Redis, "played today" flag) | Medium-High | Low | Pairs naturally with #1; Wordle-style "visible but not punishing" pattern [historytools-wordle] |
| 4 | **Shareable challenge link** (replay the exact panorama sequence a friend played) | Medium | Low-Medium | GeoHub precedent [geohub-repo]; needs only a Redis-backed short code mapping to a panorama-id list, TTL'd |
| 5 | **Open Graph tags on result/share page** for Zalo/Facebook link previews | Medium | Low | Zalo has no special API needed for basic link sharing; OG tags are the actual lever [salesmartly-zalo] |
| 6 | **Country/region streak mode** (consecutive rounds, ends on first miss below a threshold) | Medium | Low | Client + existing session flow; WorldGuessr precedent [worldguessr-repo] |
| 7 | **Custom/curated challenge sets** (e.g. "Old Quarter Hanoi only", authored like today's region tree) | Medium | Medium | Extends existing authored-region pattern rather than open user-generated maps (which would need moderation — out of scope for a no-accounts hobby project) |
| 8 | **Movement between connected Mapillary images** (limited to sequences already in the index) | Medium | Medium-High | Matches core genre expectation, but each move is a Mapillary API call against the 50k/day cap already tracked in `docs/project-overview.md`; needs a hard per-round move cap to stay affordable |
| 9 | **Duels (1v1 realtime)** | High (engagement) | High | Needs realtime transport incompatible with pure serverless hosting; only worth it if a free realtime tier (Pusher/Ably) is acceptable and rate limits are checked against expected traffic |
| 10 | **Party/multiplayer lobby** | Medium | High | Same realtime constraint as #9; WorldGuessr's version assumes a persistent server, a hosting-model change [worldguessr-repo] |

Ranking logic: #1-#6 all reuse existing Redis/Postgres/cookie infrastructure
with no new paid services and no realtime transport — they are the "do these
first" tier. #7-#8 are medium effort but still architecturally compatible.
#9-#10 are the only ideas that conflict with the "free-tier hosting, no
persistent server" constraint and should be treated as later-stage stretch
goals, not first picks.

## 4. Licensing/ToU Cautions

- Keep displaying the Mapillary logo linked to the **homepage**, not
  per-image pages, for any new surface (daily-challenge result page, share
  cards) that shows a panorama — current practice already does this
  correctly [mapillary-terms].
- Do not cache/store raw Mapillary image bytes long-term for reuse across
  sessions (e.g. to build a "photo of the day" archive) — thumbnail URLs are
  TTL'd and the ToU frames redistribution restrictively; re-fetching by id at
  play time (current pattern) is the safer posture [mapillary-forum-cache]
  [mapillary-terms].
- Any feature that adds Mapillary calls per player action (movement, live
  re-search) must be budgeted against the 50,000/day cap; that cap's exact
  scope (per-token vs per-IP vs global) is contested even in Mapillary's own
  forum [mapillary-forum-limit] — do not assume headroom without a small
  load test.
- If Google Street View Embed API is ever considered (as WorldGuessr/GeoHub
  use it) [worldguessr-repo][geohub-repo], that introduces a second imagery
  license/attribution regime alongside Mapillary's CC BY-SA — a real
  complexity increase, not just an extra credits-page line. Not recommended
  given the project's existing single-source design.
- KartaView is a plausible secondary CC BY-SA source if Vietnam coverage
  gaps need filling, but no Vietnam-specific coverage density was verified in
  this research pass (see Unresolved Questions).

## 5. Unresolved Questions

- Actual KartaView panorama density/coverage in the nine covered Vietnamese
  provinces — not measured; would need a direct API probe before treating it
  as a real gap-filler.
- Exact scope of Mapillary's 50k/day rate limit (per client_id, per account,
  or per IP) is disputed in Mapillary's own community forum
  [mapillary-forum-limit] — worth a direct empirical test (burst requests,
  watch for 429s) before budgeting a movement feature against it.
- No primary source found for Vietnamese-language UI/copy conventions
  specific to trivia/geo games (e.g. tone, formality level expected by
  Vietnamese players) — this pass found market-share and platform facts about
  Zalo, not content/localization guidance.
- "ViGuessr" (Facebook mention) could not be verified as a live product —
  worth a direct check (search Facebook group post, ask in Vietnamese gaming
  communities) if competitive positioning against a same-country GeoGuessr
  clone matters for the brainstorm.
- Zalo Mini App/Mini Game program's actual cost/eligibility (free tier vs
  paid OA requirements) was not verified — flagged as "requires registration"
  from secondary sources only; would need a direct look at Zalo's developer
  docs before scoping a real Zalo-native integration (as opposed to plain
  link sharing, which needs no integration at all).

[gg-wiki]: https://en.wikipedia.org/wiki/GeoGuessr
[geoguessr-changelog]: https://geoguessr.canny.io/changelog
[shapes-modes]: https://shapes.inc/fandom/geoguessr/game-modes
[geohub-repo]: https://github.com/benlikescode/geohub
[worldguessr-repo]: https://github.com/codergautam/worldguessr
[github-mapillarygeoguessr]: https://github.com/gabrielrbarbosa/MapillaryGeoGuessr
[mapiguesser]: https://forum.mapillary.com/t/ghibli-style-street-view-images-in-a-geo-guessing-game-thanks-to-mapillary/9467
[mapillary-terms]: https://www.mapillary.com/terms
[mapillary-forum-cache]: https://forum.mapillary.com/t/webapp-ai-fetch-issue-looking-for-help/9973
[mapillary-forum-limit]: https://forum.mapillary.com/t/50-000-requests-day-rate-limit-scope/10644
[tzovaras-panoramax]: https://tzovar.as/open-source-streetview/
[hackernoon-wordle]: https://hackernoon.com/wordle-how-the-latest-internet-sensation-went-viral
[historytools-wordle]: https://www.historytools.org/docs/wordle-streak
[eraguessr-timeguessr]: https://eraguessr.ai/guides/guess-the-location-and-year-game
[gigazine-timeguessr]: https://gigazine.net/gsc_news/en/20230821-timeguessr/
[salesmartly-zalo]: https://www.salesmartly.com/en/blog/docs/what-is-zalo
[viguessr-fb]: https://www.facebook.com/groups/j2team.community.official/posts/1775135976730367/
[gg-vietnam-map]: https://www.geoguessr.com/maps/vietnam
[tinhte-geoguessr]: https://tinhte.vn/thread/ru-anh-em-choi-geoguessr-trau-doi-kien-thuc-dia-ly-de-nghien-gia-tre-lon-be-deu-choi-duoc.3748637/
