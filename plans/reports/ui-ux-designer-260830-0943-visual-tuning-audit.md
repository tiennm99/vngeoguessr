# VNGeoGuessr Visual/Interaction Tune-Up Audit

Scope: report only, no code changed. Starting complaint: "the buttons are not pretty."

## TL;DR root cause

`button.jsx` is the unmodified shadcn scaffold (`rounded-md`, `shadow-xs`, `h-9`, gray `bg-primary` default). Every prominent CTA in the app bypasses it with inline `className` overrides (`bg-brand text-brand-foreground hover:bg-brand-hover`, `min-h-11`/`min-h-12`) because (a) the `default` variant isn't brand-colored and (b) the size scale (`h-9`=36px, `h-10`=40px) is below the 44px touch-target floor the app actually needs. Result: ~10 call sites hand-patch the same two fixes, so height/padding/font-weight/shadow drift slightly between them, there is no pressed/active state anywhere, elevation is Tailwind's near-invisible default `shadow-xs`, and the focus ring is the generic desaturated gray — nothing about a button currently signals "premium" or even "designed." This is a systemic gap, not a one-off styling miss.

---

## 1. Button system (core deliverable)

### Diagnosis
- `button.jsx:12-13` `default` variant = `bg-primary` (grayscale oklch) — never used unstyled; every real CTA re-applies brand color inline (page.js:154,263 GameClient.js:493,612 UsernameModal.js:100).
- `button.jsx:25-28` size scale starts at 36px, forcing `min-h-11`/`min-h-12` inline at page.js:147,154; GameClient.js:398,418,493,502,612,620; UsernameModal.js:94,101; DonateQRModal.js:34 — 10+ repeated overrides for one accessibility rule.
- No `active:`/pressed state anywhere — hover is the only feedback state; buttons feel static/flat on tap.
- `shadow-xs` (Tailwind's built-in near-zero elevation) on default/secondary/outline/destructive gives all filled buttons the same flat, low-contrast card-like look — nothing reads as "raised, tappable."
- Focus ring uses generic gray `--ring`, unrelated to brand, and has no `ring-offset` — hard to see against `bg-brand` buttons specifically.
- `font-medium` + `rounded-md` (6px) is generic shadcn default; feels dated next to the app's `rounded-xl` cards.

### Proposed `button.jsx` (drop-in)

```js
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-tight " +
  "transition-[background-color,box-shadow,color] duration-150 ease-out " +
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none " +
  "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none " +
  "focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "motion-safe:active:scale-[0.98] " +
  "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // = "primary" in product terms. Kept the shadcn key name "default" so
        // callers that omit `variant` still get it, matching current usage.
        default:
          "bg-brand text-brand-foreground shadow-sm hover:bg-brand-hover hover:shadow-md active:bg-[var(--brand-active)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:bg-secondary/70",
        outline:
          "border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/70 dark:bg-input/20 dark:border-input",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/70 dark:hover:bg-accent/50",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive/40",
        link: "text-brand underline-offset-4 hover:underline shadow-none",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3",       // 44px — meets touch target, no more inline min-h
        sm: "h-9 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5", // 36px, desktop-dense use only, never sole tap target
        lg: "h-12 rounded-lg px-6 text-base has-[>svg]:px-5", // 48px — for the one dominant action per screen
        icon: "size-11 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
```

**Loading state** (not in current code but referenced by task): add a `loading` prop, not a variant — `disabled={disabled || loading}` plus render a small spinner (reuse existing `.animate-spin` keyframe) before children, e.g. `{loading && <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />}`. Keeps `buttonVariants` free of a loading axis (KISS).

Why the rename-avoidance matters: renaming `default`→`primary` would touch every call site's `variant` prop (none currently set it explicitly for the brand case) for zero functional gain — skip it, just retint `default`.

Cleanup this unlocks: delete the now-redundant inline overrides at page.js:154 (`bg-brand text-brand-foreground hover:bg-brand-hover`), GameClient.js:493,612, UsernameModal.js:100, and the `min-h-11`/`min-h-12` on all 10 sites listed above.

### Before/After — 3 most prominent buttons

**Submit Guess** (GameClient.js:490-497)
```
Before: className="flex-1 min-h-12 py-4 text-base font-bold bg-brand text-brand-foreground hover:bg-brand-hover" size="lg"
After:  className="flex-1" size="lg"
```
Gets: `hover:shadow-md` lift, `active:scale-[0.98]` press feedback, disabled state flips to neutral `bg-muted`/`text-muted-foreground` (was 50%-opacity red — contrast unverifiable against whatever sits behind it).

**Skip** (GameClient.js:498-506)
```
Before: variant="outline" size="lg" className="min-h-12 py-4 px-5 text-base font-medium"
After:  variant="outline" className="px-5"   (drop size="lg" -> size="default", 44px vs Submit's 48px)
```
Deliberately smaller + no shadow + outline vs Submit's filled/shadowed/larger — sharpens the hierarchy instead of two same-size buttons that only differ by color.

**City Play cards** (page.js:210-224) — not a `<Button>` today, a bare styled `<Link>`. Borrow the button system's visual language:
```
Before:
<Link className="city-card-accent flex min-h-14 items-center justify-between p-4 rounded-lg bg-muted/40 hover:bg-muted border border-border hover:border-brand/40 transition-colors duration-200 group focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
  <span className="text-foreground font-semibold text-lg group-hover:text-brand">{city.name}</span>
  <ArrowRight className="size-5 text-muted-foreground group-hover:text-brand" />
</Link>

After:
<Link className="city-card-accent group flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-150 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
  <span className="text-foreground font-semibold text-lg group-hover:text-brand transition-colors">{city.name}</span>
  <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-subtle px-3 py-2 text-sm font-semibold text-brand-subtle-foreground transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
    Play <ArrowRight className="size-4" aria-hidden="true" />
  </span>
</Link>
```
Diff: `bg-muted/40`→`bg-card` (old fill was nearly invisible against `--surface`, both near-white/near-black), adds real elevation (`shadow-xs`→`hover:shadow-md`), replaces the bare arrow with an explicit "Play" pill so each row reads as a CTA, not a settings list item.

---

## 2. Visual hierarchy audit (per screen)

| Screen | True primary action | Current styling makes it dominant? |
|---|---|---|
| Landing (page.js) | Pick a city | **No.** Header's brand-red "Buy me a beer" (page.js:152-158) is the only brand-filled button on the page, so it visually outranks city selection, which is a flat list row. Fix: demote beer button to `outline`/`secondary`; give city rows real card elevation + CTA pill (above). |
| Game screen, active round (GameClient.js) | Submit Guess | **Mostly yes** — brand fill + `flex-1` width already wins, but Skip is same `size="lg"`/height/shadow scale so on a glance both read as equal-weight actions. Header (Back/theme/beer) is correctly deprioritized already (ghost/sm) — leave alone. |
| Result dialog (GameClient.js:512-626) | Next Round | **Partially.** Brand fill + bold text is right, but `flex-1` on both Next Round and Menu gives them identical width/height/shape — only color differs. Recommend asymmetric width (`flex-[2]` vs `flex-1`, or demote Menu to `variant="ghost"`/`link`). |
| Username modal | Start Playing | Same equal-`flex-1` issue as above; lower stakes (onboarding), acceptable but same fix applies if touched. |
| Leaderboard modal type toggle (page.js:100-116) | Pick score/distance | **No real hierarchy needed here, but affordance is wrong** — two stacked `<Button>`s styled as a vertical list read as two separate actions, not a 2-state toggle. Recommend a real segmented control (single bordered group, connected corners) instead of Button-as-tab. |

---

## 3. Token gaps in `globals.css`

Missing: an elevation scale that differs by theme, a pressed/active color layer, and a brand-tinted or darker focus ring. Propose mirroring the exact pattern already used for `--radius-*` (raw value in `:root`/`:root.dark`, wired through `@theme inline`):

```css
/* inside :root, alongside --surface etc. */
--elevation-xs: 0 1px 2px 0 rgb(0 0 0 / 5%);
--elevation-sm: 0 1px 3px 0 rgb(0 0 0 / 10%), 0 1px 2px -1px rgb(0 0 0 / 10%);
--elevation-md: 0 4px 10px -2px rgb(0 0 0 / 14%), 0 2px 4px -2px rgb(0 0 0 / 8%);
--elevation-lg: 0 10px 24px -4px rgb(0 0 0 / 16%), 0 4px 8px -4px rgb(0 0 0 / 10%);
--brand-active: color-mix(in oklch, var(--brand-hover) 85%, black);
--overlay-active: oklch(0 0 0 / 8%); /* neutral pressed-state tint for secondary/outline/ghost */

/* inside :root.dark — darker shadows read as invisible on dark bg, so add opacity + a faint top highlight instead of relying on shadow alone */
--elevation-xs: 0 1px 2px 0 rgb(0 0 0 / 40%);
--elevation-sm: 0 1px 3px 0 rgb(0 0 0 / 50%), 0 1px 2px -1px rgb(0 0 0 / 40%), inset 0 1px 0 0 rgb(255 255 255 / 4%);
--elevation-md: 0 6px 16px -4px rgb(0 0 0 / 55%), 0 2px 6px -2px rgb(0 0 0 / 40%), inset 0 1px 0 0 rgb(255 255 255 / 5%);
--elevation-lg: 0 14px 32px -6px rgb(0 0 0 / 60%), 0 6px 12px -4px rgb(0 0 0 / 45%), inset 0 1px 0 0 rgb(255 255 255 / 5%);
--brand-active: color-mix(in oklch, var(--brand-hover) 88%, black);
--overlay-active: oklch(1 0 0 / 8%);

/* in @theme inline, alongside the --radius-* lines — this overrides Tailwind's
   built-in (near-invisible) shadow-xs/sm/md/lg scale project-wide, so Card
   (shadow-sm) and Dialog (shadow-lg) get the same coordinated, dark-aware lift
   as buttons for free. */
--shadow-xs: var(--elevation-xs);
--shadow-sm: var(--elevation-sm);
--shadow-md: var(--elevation-md);
--shadow-lg: var(--elevation-lg);
```

Also worth a `focus-visible:ring-ring/60` bump (from `/50`) plus checking whether `--ring` itself should darken — see contrast note below.

---

## 4. Specific ugly spots

| File:line | Wrong | Fix |
|---|---|---|
| `button.jsx:8` | `shadow-xs` on every filled variant = no visible elevation | New `--elevation-*` scale above |
| `button.jsx:25` | `h-9`/`h-10` below 44px touch target, forcing inline `min-h-*` everywhere | Bake 44/48px into `default`/`lg` sizes |
| `page.js:104-115` | Leaderboard type toggle = 2 stacked `<Button>`s mimicking a tab, not a segmented control | Real 2-state segmented control (bordered group, connected corners) |
| `page.js:152-158` | "Buy me a beer" is the only brand-filled button on the landing header — outranks city selection | Demote to `variant="outline"` |
| `page.js:210-224` | City rows: `bg-muted/40`, no shadow, arrow-only affordance — reads as a settings list, not playable cards | See before/after above |
| `page.js:260-268` | Debug FAB re-skins `variant="outline"` entirely (`bg-card rounded-full shadow-sm size-12`) fighting the variant system | Fine as a one-off, but note it drifts if outline variant changes; consider a dedicated `icon` treatment |
| `GameClient.js:406-408` | City `Badge` uses default (grayscale) variant, overridden inline with `bg-brand` — same DRY issue as buttons | Add a `brand` badge variant: `"border-transparent bg-brand text-brand-foreground [a&]:hover:bg-brand-hover"` |
| `GameClient.js:489-497` | Submit disabled state = `bg-brand` at 50% opacity via generic `disabled:opacity-50` — contrast unverifiable against arbitrary backing, still "looks clickable" | New button system's `disabled:bg-muted disabled:text-muted-foreground` |
| `GameClient.js:498-506` | Skip = same `size="lg"` as Submit, same shadow scale — competes visually | Demote size (see before/after) |
| `GameClient.js:358-365` `getScoreBg` | Hardcoded Tailwind palette (`green-600`/`amber-600`/`orange-600`/…) bypasses brand/semantic tokens entirely; **`amber-600`/`orange-600` + white text ≈ 2.9:1, fails even the 3:1 large-text floor** | Darken those two stops one notch (`amber-700`/`orange-700`) or move to tokenized `--success`/`--warning`/`--danger` |
| `GameClient.js:526-528` | Score circle: flat 80×80 filled circle, no shadow/ring, sits directly on dialog bg — flat/dated | Add `shadow-md` (new token) + `ring-4 ring-background` for a medal-like lift |
| `GameClient.js:535` | Distance stat `Badge variant="outline"` — plain gray border, low visual interest for the headline number | `variant="secondary"` or `bg-brand-subtle` to tie into brand palette |
| `GameClient.js:608-624` | Next Round / Menu both `flex-1` — equal width undercuts the "Next Round is primary" intent | Asymmetric width or demote Menu to `ghost`/`link` |
| `GameClient.js:466-475`, `478-486` | Minimap tap-overlay + collapse button are raw `<button>`s with ad hoc `rounded-full`/`backdrop-blur`, not sharing the button system's radius/elevation tokens | Not urgent (functionally fine, mobile-only, no scroll regression risk), but pull `--elevation-md`/radius tokens so they don't visually drift once the button system changes |
| `LeaderboardList.js:65-71` | "YOU" row highlight uses ad hoc `amber-500`/`amber-950` unrelated to `--brand` — a 3rd accent color on one screen (brand red header badge + amber user-highlight + gold/silver/bronze medals) | Either tokenize as `--highlight-user` (documented, intentional) or reconsider tying to `--brand`; low priority, currently at least internally consistent |
| `LeafletMap.js:70` (live guess map) vs `GameClient.js:300-323` (result map) | Live map uses Leaflet's default **blue** pin; result map uses custom red/green `divIcon`s | Reuse the same red/green `divIcon` marker on the live guess map too, for one consistent "this is your guess" color language |
| `ThemeToggle.js:57-59` | Selected state `bg-brand shadow-sm` — already close to the target button language | Keep as reference pattern, no change needed |

---

## 5. Dark mode parity

| Proposal | Light | Dark | Risk |
|---|---|---|---|
| Brand button fill (`bg-brand`/`text-brand-foreground`) | white on `#da251d` ≈ 5.5:1 — pass | near-black (`oklch(0.145)`) on lightened red (`oklch(0.68)`) ≈ 6-7:1 est. — pass | Low — spot-check with a contrast tool before shipping, estimate only |
| New elevation tokens (`--elevation-*`) | subtle black shadows | more opaque + inset top highlight so cards/buttons still read as "raised" against dark bg | None (non-text) — needs visual QA, not a contrast rule |
| Disabled state (`bg-muted`/`text-muted-foreground`) | ≈4.6:1 — pass | muted-foreground already "lifted" for AA per existing comment (globals.css:121-122) — pass | Low, strictly better than old translucent-red disabled state |
| Focus ring (`--ring`, generic gray) | gray `oklch(0.708)` ring against white bg ≈ **2.5–3:1 est., borderline/fails** WCAG 1.4.11's 3:1 non-text floor | same token, similarly borderline against dark card bg | **Medium — flagged, needs measurement.** Recommend darkening `--ring` to ~`oklch(0.55)` or using a brand-tinted ring (`focus-visible:ring-brand/60`) on the `default` (brand) button variant specifically |
| `getScoreBg` amber-600/orange-600 + white text | ≈2.9:1 — **fails** even large-text 3:1 | same swatches, no dark-specific adjustment exists today | **Medium-high — real bug, not just polish.** Darken those two stops |
| Ghost/outline hover (`bg-accent`) | `oklch(0.97)` vs card `oklch(1)` — barely visible | `oklch(0.269)` vs card `oklch(0.205)` — barely visible | Not a WCAG issue (decorative hover, no text pairing requirement), but a usability nit — widen the delta |

---

## 6. Stack changes worth considering

Ranked by (UI/UX gain ÷ cost). None of these are required for the button-system fix above; all are additive.

| # | Change | Gain | Cost | Verdict |
|---|---|---|---|---|
| 1 | **Swap Leaflet's raster tile URL to CARTO `dark_matter`/`positron` based on theme** (LeafletMap.js:55, GameClient.js:293) | Fixes the single biggest dark-mode inconsistency: a full-bleed bright-white map floating over an otherwise dark, immersive panorama. Likely the most visible remaining "unpolished" spot in dark mode. | ~2-line URL swap + one theme-change listener (reuse existing `watchSystemTheme`/theme state) to pick `light_all` vs `dark_matter`; zero new dependency; attribution text needs "+ © CARTO" added; same free/keyless usage policy as OSM tiles. ~20-30 min. | **Recommend — do this.** Highest leverage, near-zero cost. |
| 2 | Migrate guess map to MapLibre GL (vector tiles, full theme control) | True vector dark styling, brand-colored roads/labels possible, smoother zoom | New ~200KB+ gzip dependency, needs a hosted vector style (MapTiler/Protomaps, likely an API key), moderate-high rewrite of `LeafletMap.js` + result map + click/marker/fitBounds logic (touches anti-cheat guess-placement code — handle carefully) | **Don't do now.** Tile swap above captures ~80% of the visible gain at ~2% of the cost/risk. Revisit only if the product wants custom map branding beyond light/dark parity. |
| 3 | Animation library (`motion`/Framer Motion) for result reveal, score count-up, map zoom-to-fit | Spring-based reveal, easy count-up number, staggered leaderboard entries | ~35-50KB gzip; app already has a working hand-rolled `@keyframes fadeInUp` + stagger mechanism (`animation-delay`) in globals.css; a count-up is ~15 lines of `requestAnimationFrame` with no dependency | **Don't add.** Hand-roll a small count-up hook + reuse existing keyframe pattern with per-row `animation-delay` for leaderboard stagger. Only reconsider if gesture/physics interactions beyond Leaflet's own are needed later. |
| 4 | `next-themes` replacing `src/lib/theme.js` + `ThemeToggle.js` | SSR flash prevention, cross-tab sync, community-maintained edge cases | Current hand-rolled implementation already handles `:root.dark` toggling, `watchSystemTheme`, and SSR/client mismatch via a documented `mounted` guard — it reads as deliberately tuned to this app's Tailwind v4 `:root.dark` pattern, not naive. Migration would touch `ThemeToggle.js` fully + provider wiring for a purely dev-convenience win, not a user-visible one. | **Don't recommend.** No material UI/UX gain; current code is functionally equivalent and already accessible. Revisit only if >2 themes are planned. |
| 5 | Re-add shadcn `tooltip`/`popover` for icon-only buttons (theme toggle, minimap expand/collapse, debug FAB) | Slight desktop-mouse discoverability gain | New Radix dep (~4KB) per primitive; app is mobile-first and tooltips don't fire on touch — the primary platform gets zero benefit; existing `aria-label`/`title` already covers accessibility | **Don't add.** Low ROI for a mobile-first app; skip both. |
| 6 | `color-mix()` for deriving `--brand-hover`/`--brand-active` procedurally instead of hand-tuned literals per theme | Fewer duplicate color stops to keep in sync across light/dark when brand color ever changes | Zero bytes, native CSS; only risk is Safari <16.2 lacking `color-mix()` support | **Optional, weak recommend.** Nice token-system simplification, not urgent; already used for the new `--brand-active` token proposed in §3. |

---

## Unresolved questions

1. Focus-ring and `amber-600`/`orange-600` contrast estimates above are approximate (oklch-based reasoning, not a measured tool) — verify with a real contrast checker before locking in exact replacement stops.
2. Is "Buy me a beer" intentionally the loudest CTA on the landing page as a donation-conversion decision, or is that accidental? Demoting it is a product call, not just a style call.
3. CARTO tile swap (stack §1) — confirm no attribution/licensing objection before implementing; should be trivial but flagging since it touches an external third-party tile host.
4. Tokenizing score-band colors (`getScoreBg`/`getDistanceColor` in `lib/game.js`) into `--success`/`--warning`/`--danger` touches `lib/game.js` + `GameClient.js` + `LeaderboardList.js` simultaneously — worth a dedicated small pass now, or defer to a later cleanup?

Status: DONE
Summary: Root cause of "buttons not pretty" is systemic — unmodified shadcn `button.jsx` (sub-touch-target sizes, near-invisible shadow, no active state, gray non-brand default) forces ~10 call sites to hand-patch height + brand color inline; proposed a retinted/resized cva config, a coordinated dark-aware elevation token scale mirroring the existing `--radius-*` pattern, per-screen hierarchy fixes, and a ranked stack-change list (CARTO tile swap recommended, MapLibre/motion/next-themes/tooltip all deferred).
Concerns: two real (not just cosmetic) contrast risks found — score-circle amber/orange stops at ~2.9:1 white-on-color, and the generic gray focus ring at ~2.5-3:1 on light backgrounds — both need measured verification, flagged in §5 and unresolved Q1.
