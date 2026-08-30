# GeoGuessr UI/UX patterns — research for VNGeoGuessr

Scope: report only, no code changed. ~10 searches/fetches. Facts marked [F], inference marked [I].

## Sources used (credibility)
- `design.geoguessr.com` (official brand book) — authoritative for brand marketing identity, but marketing site ≠ live game client necessarily [F/I mix, noted below].
- `en.wikipedia.org/wiki/GeoGuessr` — tertiary but cites the tech stack (Backbone.js + Google Maps API) and "standard overlay" inset map — treat as fact.
- `latb.io/geoguessr/articles/the-maths` — third-party technical breakdown of scoring math (bounds/distance), credible, not official.
- `codergautam/worldguessr` (GitHub, MIT, open-source clone, Next.js) — NOT GeoGuessr's own code, but a widely-used clone whose implementation choices are cheap, verifiable, and directly portable. Used only for "here's a reproducible pattern," not "here's what GeoGuessr does internally."
- Medium redesign critique (AntonDyadyushev) — blocked by 403, only search-snippet visible; low confidence, flagged as weak source below.
- App store / review sites (TapSmart, apprview) — anecdotal user reviews of mobile app, useful for UX complaints, not spec.
- No access to GeoGuessr's actual client JS/CSS (it's a paid, obfuscated SPA) — nothing here is decompiled; everything about GeoGuessr's own internals is inference from docs/press/reviews unless cited as Wikipedia fact.

---

## 1. Buttons — visual language
No official spec found (brand book has no button/spacing tokens). What's verifiable/inferable from screenshots and reviews:
- [I] Primary CTA is a solid-fill, medium-large pill/rounded-rect button (not sharp corners), commonly green for "start/confirm" actions on mobile (per Play Store review: "tap the green button in the bottom right corner").
- [I] Buttons are chunky (comfortable thumb targets on mobile), not thin/outline — consistent with a dark-background game UI where outline buttons would look weak against dark chrome.
- No concrete px values for radius/height/padding/letter-spacing/shadow could be verified. **Do not invent numbers** — if you want concrete values, pick your own tokens (e.g. shadcn default `rounded-lg`/`rounded-full`, `h-11`–`h-12` for primary actions) rather than attributing them to GeoGuessr.

## 2. Colour system
[F] Official brand book palette (`design.geoguessr.com/the-brand/colors`):
- Purple 10 `#D9D7F0`, Purple 20 `#A19BD9`, Purple 50 `#7950E5` (looks like the brand accent), Purple 80 `#563B9A`, Purple 100 `#1A1A2E` (dark surface), Black `#10101C`.
- Accents: Yellow 50 `#FECD19`, Orange 50 `#FFA43D`/80 `#BF7B2E`, Green 50 `#97E851`/80 `#6CB928`, Turquoise 50 `#3AE8BD`/80 `#1F9C7D`, Blue 50 `#00A2FE`, Red 50 `#E94560`.
- Logotype colours: **GG Red `#CC302E`**, white, black. **Trademark — do not copy this exact red or the wordmark.** (Coincidentally close to but distinct from our own brand red `#da251d`; keep ours, don't drift toward theirs.)
- Brand book gives **no usage guidance** (which colour = surface/text/success/fail). That mapping below is [I] inferred from convention + the one search snippet describing pre-rebrand UI: "previously used dark blue as a main background color with huge gradients at the top."

[I] Important caveat: the brand book is GeoGuessr's *marketing identity* site — it may represent current or upcoming brand direction, not necessarily the pixel-exact palette of the live game client, which per the redesign-critique snippet historically ran a dark navy/blue chrome, not this purple. **Don't assume the in-game HUD literally uses Purple 100 as its background** — treat the purple family as "a plausible dark, low-saturation cool base + one saturated accent" pattern to borrow, not a hex you can cite as "verified in-game."

[I] Inferred usage pattern worth stealing regardless of exact hex: dark, near-black-but-not-pure-black base (`#10101C`/`#1A1A2E` range) so panorama imagery and white text both pop; ONE saturated accent colour reserved for primary CTA + score highlights; green/red reserved specifically for success/fail feedback (round score, correct/close vs far); everything else (secondary buttons, borders) stays low-saturation grey-on-dark. This is a standard "dark-UI-with-one-accent" discipline, not GeoGuessr-specific, but well-suited to a dark full-bleed panorama screen.

## 3. Typography
[F] GeoGuessr's brand typeface is **"Geoguessr Sans"** — a proprietary custom font (brand book: "bold & dynamic... clean curves... modern yet friendly"). **This is proprietary — do not use, embed, or clone this font.** No public weight/size/letter-spacing/uppercase tokens are published; brand book explicitly omits them. Anything more specific than "geometric, rounded, confident sans" is unverifiable — don't invent numbers.
- [I] For a free clone, a geometric/rounded sans with similar "friendly but bold" energy (e.g. a variable weight already in your stack, or a free alternative like Space Grotesk/Poppins if you want more character than Geist) is a reasonable stand-in; Geist Sans (already in your stack) reads as neutral/modern but less "adventurous" — that's a stylistic gap, not a bug, and not worth a font swap on its own.
- No verified info on numeric-display treatment (tabular figures, uppercase+tracking for labels) — mark unresolved.

## 4. Result screen composition
[F] Scoring formula (from latb.io + general docs, consistent across sources): `S = 5000 * exp(-10 * d / D)` where d=guess distance, D=map's max diagonal; max 5000/round, 25000/5-round game.
[F] Audio/haptic feedback exists: a chime for guesses ≤500km, a duller sound for far guesses; haptic feedback on pin-drop and confirm (mobile).
[I] Result screen composition (from general knowledge of screenshots + latb.io's mention of "bounds of a rectangle surrounding all locations" for the summary map): score number, distance, and a map that auto-fits its viewport to include both the guess pin and actual pin (zoom-to-fit-bounds), typically with a line/label connecting the two points and the distance annotated on it. This is very well-established as public knowledge from screenshots but **I did not find a citable primary source confirming the literal guess-actual connecting line** — treat as high-confidence inference, not hard fact.
[I] "What makes it feel rewarding" is mostly sequencing, not decoration: reveal happens in a fixed rhythm — map zooms/pans to reveal both pins → distance appears → score counts up → running total updates → next-round CTA appears last, so the player's eye is walked through cause→effect→reward before being nudged forward. Nothing here requires a specific tech; it's timing/choreography.
[I]/reproducible pattern: WorldGuessr's `AnimatedCounter.js` (MIT, open-source clone, not GeoGuessr's own code) implements the score count-up with **plain React state + `setInterval` at 33ms (~30Hz) + ease-out-cubic**, no animation library. That's a directly usable, license-clean reference for "how would we build this" regardless of whether it matches GeoGuessr's exact internals:
  ```
  https://raw.githubusercontent.com/codergautam/worldguessr/master/components/AnimatedCounter.js
  ```

## 5. In-game HUD
[F] Wikipedia: the guess/inset map uses **"Google Maps's standard overlay"** — i.e. it is not a custom dark-reskinned map, it's Google's default (light) roadmap style, floating as a small card over the dark panorama chrome.
[I] Because the minimap stays visually light/bright by default, GeoGuessr's actual solution to "bright map on dark UI" is **not** to theme the map dark — it's to frame it: rounded corners, drop shadow, and a dark card border/padding around the map so the *contrast itself* reads as intentional (a "light window" floating on dark chrome), and it expands on hover/tap for precision. This directly answers the map-styling question below.
[I] Other HUD elements (compass, zoom, round counter, timer) are minimal, corner-anchored overlays kept small/translucent so the panorama stays dominant — consistent with the "clutter-free" description in the TapSmart review. No verified pixel/opacity values.

## 6. Mobile specifics
[F/I] Play Store description: green CTA bottom-right opens/confirms the map guess; "drop a pin... you'll receive a score." 
[I] User complaints (from review aggregator, low-confidence single source): missing confirmation dialogs around the reset-view button and the confirm-guess button — i.e. destructive/committing taps have too little friction on mobile, which frustrates users. **Actionable anti-pattern to avoid**: our Submit action should have a clear, deliberate confirm state, not a single ambiguous tap.
[I] Movement controls: swipe to look around, pinch to zoom; some users want single-tap-to-move instead of double-tap — a control-scheme nuance, not directly relevant to your panorama library choice but relevant to hit-target sizing.

## 7. Motion
[I] Score count-up: see §4 — reproducible with vanilla JS/React (`setInterval` + easing), **no animation library required** to match this specific effect. A small team can ship this with zero new dependencies.
[I] Map zoom-to-fit on reveal and guess→result transition: no confirmed implementation detail found (no access to GeoGuessr's own bundle). If your map is Leaflet, this is a **native capability** — `map.fitBounds([guessLatLng, actualLatLng], {padding})` is a one-line Leaflet call, not something requiring a new library.
[I] No evidence found of a heavy animation library (e.g. GSAP/Framer Motion) being distinctive to GeoGuessr's result screen; the effects described (count-up, fit-bounds, fade/slide-in of dialog) are all achievable with CSS transitions + native map APIs + a small counter hook. Treat "we need a big motion library for this" as unnecessary until proven otherwise.

---

## Map/tile tooling — direct answer to the Leaflet/OSM dark-mode concern
- [F] GeoGuessr's own inset map is Google Maps' **standard (light) style**, not a custom dark tile set (Wikipedia: "standard overlay"). So GeoGuessr itself does **not** solve "map looks bright on dark UI" by reskinning tiles — it solves it by card framing (shadow/border/rounded corners/padding) as in §5.
- **Implication for your stack**: your current Leaflet + raster OSM setup staying bright in dark mode is not actually a deviation from GeoGuessr's own approach — you can legitimately ship "bright map, dark frame around it" and call it faithful, with zero new dependency.
- If you *do* want a genuinely dark-styled minimap (not required to match GeoGuessr, but nicer), that's a tooling decision, not free: raster OSM tiles have no first-party dark variant. Options, all requiring a new tile provider/API key (stack-affecting — flag to user before adopting):
  - CARTO Dark Matter raster/vector tiles (free tier, attribution required) — swap-in replacement for the OSM tile URL in Leaflet, no library change.
  - Stadia Maps "Alidade Smooth Dark" (free tier w/ API key, Leaflet-compatible).
  - MapTiler dark styles (vector, requires MapLibre GL JS instead of Leaflet raster — bigger lift, new library).
  - Do-nothing option (recommended given GeoGuessr's own precedent above): keep Leaflet+OSM raster, style the *container* (rounded-xl, shadow-lg, dark border/padding) rather than the tiles.
- [I] Note: GeoGuessr's use of Google Maps Platform (Street View + Maps JS SDK) is commercial/paid — confirmed indirectly via multiple sources on API billing being a real cost driver for GeoGuessr-likes. This is irrelevant to your project since you're already on OSM/Leaflet (free), but explains why open-source clones (WorldGuessr) deliberately avoid the Google Maps JS SDK in favor of Leaflet + free tile providers — same tooling direction you're already on.

---

## What to steal
1. Dark, near-black (not pure black) base + exactly one saturated accent colour for CTA/score — cheap, high-impact discipline, zero new deps.
2. Frame-don't-reskin approach to the minimap: rounded card, shadow, border, padding — solves the "bright map on dark UI" problem you already have, with zero new deps or tile providers.
3. Result-screen choreography: reveal map fit-to-bounds → distance → score count-up → running total → next-round CTA, in that fixed order. All native CSS transitions + Leaflet `fitBounds` + a `setInterval`-based counter hook (see WorldGuessr's `AnimatedCounter.js` as a license-clean, ~70-line reference).
4. Explicit confirm step before committing a guess (avoid the mobile complaint about missing confirmation on committing actions).
5. Minimal, corner-anchored HUD chrome (round counter, timer) kept small/translucent so panorama stays dominant.

## What NOT to copy
- Their custom "Geoguessr Sans" typeface — proprietary, don't clone or approximate closely enough to be a passing-off risk.
- Their logotype red `#CC302E` and wordmark — trademark; keep your own `#da251d` flag red.
- Paid Google Maps/Street View SDK dependency — not applicable, you're on free OSM/Mapillary-style tooling already; don't add Google Maps just to "match."
- Any "big team" scale features not relevant to a small free game: their multiplayer infra, their proprietary map-editor ecosystem, their monetization/paywall UX (membership gating). Borrow the *look*, not the *business model*.

## Trademark/brand flags (do not imitate)
- GG Red `#CC302E` and the GeoGuessr wordmark/logo — brand-protected.
- "Geoguessr Sans" typeface — proprietary asset, not licensed for reuse.
- Any literal reuse of their brand-book purple family as "GeoGuessr's colors" in your own marketing copy would be a misattribution risk even though the palette itself (arbitrary hex values) isn't copyrightable — just don't market VNGeoGuessr as "styled like GeoGuessr's own X" using their exact tokens.

## Unresolved questions
1. No verified numeric button tokens (radius/height/padding/shadow) — brand book doesn't publish them and the live client is behind a paid, obfuscated SPA. Anyone wanting exact values would need to inspect the live app's rendered CSS directly (not done here — out of scope for a search-based pass).
2. Whether the actual *live* game client currently uses the purple brand-book palette or still runs the older dark-navy chrome mentioned in the redesign critique — brand book and live client may have diverged; not verified.
3. Could not fully read the Medium redesign-critique article (403 blocked) — only search snippets seen; treat its claims (Dec 2022 redesign backlash, dark-blue background, green CTA suggestion) as weakly sourced.
4. No hard source confirming the literal guess-to-actual connecting line/label on the single-round result map — inferred from common knowledge/screenshots, not cited.
5. No verified detail on GeoGuessr's own result-screen animation implementation (library vs vanilla) — WorldGuessr's vanilla approach is a reasonable, license-clean proxy but is not proof of GeoGuessr's internals.
6. Typography hierarchy for score/distance numeric display (tabular figures? uppercase labels? tracking values?) — not published anywhere found.

Status: DONE_WITH_CONCERNS
Summary: Gathered concrete, sourced facts on GeoGuessr's brand palette, scoring math, Google Maps-based (light-style, unreskinned) minimap, and mobile UX complaints, plus a license-clean reproducible pattern (WorldGuessr's AnimatedCounter) for score count-up; several requested specifics (button px values, live-client palette vs brand-book palette, exact result-screen animation stack) are not publicly documented and are flagged as unresolved rather than invented.
Concerns/Blockers: Medium redesign-critique source was blocked (403), reducing confidence on the Dec-2022 UI backlash narrative; no access to GeoGuessr's live obfuscated client CSS/JS means several "concrete value" asks in the task (button radius/height/padding, exact typography scale) could not be verified and are explicitly called out rather than guessed.
