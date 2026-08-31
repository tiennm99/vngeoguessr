# UI/UX Improvement Synthesis — VNGeoGuessr

Consolidates three advisory passes (2026-08-31):

- Code audit: [ui-ux-review-260831-1853-uiux-audit.md](ui-ux-review-260831-1853-uiux-audit.md)
- External research: [researcher-260831-1853-geo-game-ux.md](researcher-260831-1853-geo-game-ux.md)
- Brainstorm: full text below (returned inline by agent, preserved here)

## Convergent findings (multiple agents, highest confidence)

1. **Loading-flag defect** — audit C1 + brainstorm Q2 found independently. Single
   `loading` flag in `GameClient.js` full-screen-loaders on guess submit
   (unmounts panorama + map, shows "Loading panoramic image..."), while the
   Submit button's "Processing..." state is unreachable dead code; next-round
   load shows nothing. Fix: split `initialLoading` / `submitting`. Defect, not
   enhancement.
2. **Panorama failure dead end** — audit C2 + brainstorm Q4. Native `alert()`
   then permanent fake loading state; only recovery is Skip. Fix: inline error
   + Retry/Back.
3. **Session arc missing** — research (round counter is standard retention
   pattern) + brainstorm M1 (5-round set, running total, summary screen).
4. **Keyboard users cannot place a guess** — audit H1 (WCAG 2.1.1) + research
   accessibility topic. Also: score count-up inside `aria-live="polite"`,
   missing marker aria-labels on reveal map.

## Unique headline findings

- **Region-relative scoring (brainstorm #1, highest leverage)**: `SCORE_BANDS`
  is absolute (1km+ = 0 pts) across regions from ~35 km² to 331,000 km². The
  emphasized "Play anywhere in Vietnam" CTA yields near-guaranteed zeros for
  honest guesses. Scale bands by region bbox diagonal server-side; keep 0–5
  scale so boards stay valid. Fix before building any new mode.
- **Dead round on dialog dismiss (audit C3)**: result dialog closable via
  X/Esc/overlay into a consumed session; re-submit shows misleading "Round Not
  Recorded". Force Next Round / Menu.
- **Research**: app already implements most industry patterns correctly
  (corner-widget map, tap-cover, animated reveal, score bands, safe-area) —
  targeted gaps, not a rebuild. Mobile layout rework explicitly not needed.

## Recommended sequence

1. Split loading state (XS, defect)
2. Region-relative scoring bands + dynamic scoring copy (S)
3. Force result-dialog flow, no dismiss-to-dead-round (XS)
4. Inline panorama error + retry (XS)
5. "Continue in <region>" localStorage shortcut on home (XS)
6. Prefetch next round during result dialog (S; preload image URL too, not just metadata)
7. Band-scale strip on result dialog (S, bundle with #2)
8. 5-round set w/ running total + summary screen (M) — then result-reveal
   full-screen sheet, coach mark, targeted mobile fixes (larger minimap,
   pin-placed indicator, confirm inside expanded map)
9. Accessibility batch: keyboard guess placement, aria-live fix, marker
   labels, self-hosted marker PNGs (currently cdnjs-dependent)
10. Later: daily challenge (deterministic date seed, 5-round set) + emoji share
    grid → async "beat my score" links. Skip: real-time duels, mobile rework,
    sound, OG-image cards.

## Full brainstorm (verbatim from agent)

Grounded in: `src/app/page.js`, `src/app/components/GameClient.js`, `GuessMapPanel.js`, `RoundResultDialog.js`, `RegionPicker.js`, `PanoramaViewer.js`, `src/lib/game.js`, `docs/game-flow.md`, `docs/features.md`.

### 0. Assumptions challenged first

**Assumption 1: "the game needs more features."** It doesn't, yet. It has a broken *feedback gradient*. The scoring ladder in `src/lib/game.js` is absolute (1km+ = 0 pts) but the game lets you play a region tree spanning ~35 km² (Quận 7) to 331,000 km² (Vietnam). At country level almost every honest guess scores 0. A player's first session on "Play anywhere in Vietnam" — the emphasised primary CTA on the home page — is a near-guaranteed string of zeros. No multi-round mode, no streak, no daily challenge fixes that; they all multiply a broken reward signal. **Fix scoring before adding modes.**

**Assumption 2: "the loading spinner is fine."** `GameClient` early-returns a full-screen spinner whenever `loading` is true, and `handleSubmitGuess` sets `loading = true`. So submitting a guess unmounts the entire game tree — including the Photo Sphere viewer, which gets `destroy()`ed and rebuilt behind the result dialog. The `loading` prop on the Submit button is dead code; it never renders. Symmetrically, `handleNextRound` never sets loading, so the next round shows a black `bg-neutral-900` box with no indicator. Two opposite bugs from one overloaded state flag.

**Assumption 3: "no accounts means no social loop."** Wordle has no accounts. A daily challenge + emoji share grid works entirely on a deterministic server seed + `localStorage`. The absence of accounts costs anti-cheat (already an accepted trade-off) and cross-device continuity — not the social loop itself.

**Assumption 4 (design around it): imagery is one static Mapillary thumbnail.** No walking, no zoom beyond `thumb_2048`. Precision is structurally capped — another argument for region-relative scoring, and against "duels on precision."

### Horizon 1 — Quick wins

- **Q1 Region-relative scoring bands** — keep 0–5 integer scale (board keys stay valid). Scale `SCORE_BANDS` thresholds by played region's bbox diagonal (already server-side). District keeps 50m…1km; Vietnam might be 5/15/50/150/400 km. One function, one call site, home-page scoring table becomes dynamic. Trade-off: boards silently mix two scoring eras; any "5 pts = 50m" copy must derive from `SCORE_BANDS`. Effort S. **DO — highest leverage.**
- **Q2 Split `loading` → `initialLoading`/`submitting`** — XS. **DO (defect).**
- **Q3 Prefetch next round during result dialog** — fire `/api/new-game` on `showResult`, swap in on Next Round; must preload `imageData.url` too. Costs: wasted lookup + orphan Redis session per quitter (self-expires); no tile-cap impact. Effort S. **DO.**
- **Q4 Inline error + Retry replacing `alert()`** — XS. **DO.**
- **Q5 "Continue in <region>"** — localStorage last-played code, top row on home; don't give two rows accent emphasis. XS. **DO.**
- **Q6 Band scale strip on result dialog** — derives from `SCORE_BANDS`; answers "how close did I need to be?" (more important post-Q1). S. **DO bundled with Q1.**
- **Q7 Keyboard shortcuts** (Space/Enter submit, Enter next, Esc collapse map) — must not fire in search box. XS. **MAYBE (desktop share dependent).**
- **Q8 Defer username prompt to first result dialog** — S. **MAYBE** (current placement defensible, current blocking is not).
- **Q9 Result-map polish** — auto-fit bounds + "View on Mapillary" link (XS): **DO**; animated guess→target line: **MAYBE**.
- **Q10 Sound/haptics** — **SKIP** (mute-toggle plumbing outweighs value).

### Horizon 2 — Medium

- **M1 5-round set with running total** — client-side round counter + set summary (5 thumbnails, distances, total /25, Play again / Change region). Server scoring untouched. Client state is editable — irrelevant given accepted cheat tolerance, unless set totals ever post to a board (then server-side or nothing). Skip must consume a round or the set is farmable. Effort M. **DO, right after Q1.**
- **M2 Result reveal → full-screen sheet** — priority: score → distance → map → boards behind "Rankings" disclosure. Don't ship before M1 (rank rows are currently the only progression signal). M. **DO after M1.**
- **M3 Streaks** — localStorage-only streaks die on cache clear/second device; broken streak is worse than none. **MAYBE — only inside daily challenge, never standalone.**
- **M4 Mobile layout rework** — current pattern is right (corner minimap, tap-cover, safe-area). Instead: confirm inside expanded map, pin-placed indicator on collapsed minimap, larger minimap (144px small for Vietnam bounds). **SKIP rework, DO the three fixes.**
- **M5 Onboarding** — one-time coach mark on minimap ("tap to place your guess"). **DO coach mark, SKIP tour.**
- **M6 Region picker search + random district** — reuse diacritic matcher from `MapSearchBox` (extract, don't fork). S. **MAYBE.**

### Horizon 3 — Ambitious (sketch)

- **H1 Daily Challenge** — same 5 panoramas for all, date-seeded (Redis key per date), one attempt/day, daily board, resets 00:00 ICT (timezone locked forever). Strongest account-less retention mechanic; composes with M1/M3. Risk: a bad daily set hurts everyone; no easy quality filter. M–L on top of M1. **DO — flagship next-quarter, after M1.**
- **H2 Async "beat my score" links** — URL-encoded seed, identical 5 panoramas, target score. Same machinery as H1. S–M. **DO after H1 — the 10%-cost duels.**
- **H3 Emoji share grid** — `🟩🟩🟨⬜⬜ 18/25 — VNGeoGuessr #142`. S. **DO with H1; SKIP OG-image card until text grid proves sharing.**
- **H4 Real-time duels** — websockets, lobbies, ops burden, competitive cheating; static imagery makes precision duels arbitrary. **SKIP.**
- **H5 More provinces** — content, not UI; tile-cap-bound; competes for same maintainer hours. **MAYBE.**

### Ranked top 5

| # | Idea | Effort | Improves | Key trade-off |
|---|---|---|---|---|
| 1 | Q1 region-relative scoring | S | reward signal, fairness, board meaning | mixes two scoring eras |
| 2 | Q2 split loading state | XS | clarity, stops viewer teardown | none |
| 3 | M1 5-round set | M | retention (arc + completion) | client state unauthoritative; skip rule |
| 4 | Q3 prefetch next round | S | perceived speed every round | orphan sessions from quitters |
| 5 | H1 daily challenge + H3 grid | L | retention + acquisition | timezone locked; bad set hurts all |

Simplest viable: Q1 + Q2 + Q4 + Q5 (~1–2 days, no new state machines/schema/deps).

## Unresolved questions

1. Desktop vs mobile traffic split? (decides Q7 keyboard shortcuts, weight of mobile fixes)
2. Mix pre/post-rescale scores on existing boards, or new board keys for the rescaled era?
3. Does Skip consume a round inside a 5-round set?
4. Is Mapillary attribution rendered anywhere in the UI? Brainstormer saw none — verify against Mapillary terms before adding "View on Mapillary" links.
5. From audit: multi-round structure intent, geocoder choice, dark map-tile stance.
6. From research: compass-control intent, leaderboard scroll-to-self, username-collision handling (verify `LeaderboardModal.js`, `session.js`, `username.js` before acting).
