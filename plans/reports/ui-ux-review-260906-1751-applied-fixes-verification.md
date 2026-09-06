# UI/UX verification — applied fixes on `feat/game-region-path-segment`

Date: 2026-09-06 (18:05)
Scope: `git diff -- src docs`, uncommitted. Source review + a contrast
measurement. No browser, no build.
Prior: `ui-ux-review-260906-1659-notfound-and-picker.md` (findings),
`fix-260906-1717-review-findings-resolved.md` (claims).

## 0. Read this first — the working tree moved under the review

The files changed **five times during this review**, by something other than
me. Timeline from mtimes, each state read directly:

| Time | Observed state |
|---|---|
| 17:18–17:27 | The snapshot in the task's diff. Everything below verified against this |
| 17:57:10 | `src/lib/regions.js` **guard body removed**, its comment still describing the round-trip check |
| 17:59:29 | Guard restored; `npx vitest run tests/regions.test.js` → 27 passed |
| 17:59:57 | **Both** 404s' `actionHref` changed to `/broken` |
| 18:02:32 | `/broken` reverted; `src/app/not-found.js` briefly back to `actionLabel="Go to the start"` |
| 18:02:48 | **Settled.** Label fix back, but its four-line rationale comment did not come back with it |

Reads like a mutation-test loop (each injected fault is exactly what a new
assertion in `tests/e2e/routing.spec.js` targets: `toHaveAttribute('href', '/')`,
the dotless-i 404, the label). Harmless if so — except for what the last write
dropped.

**Settled state, re-diffed at 18:03:** `NotFoundPanel.js`,
`game/[region]/page.js`, `game/[region]/not-found.js`, `lib/regions.js` and
`docs/game-flow.md` are byte-identical to the reviewed snapshot. Every verdict
below holds. The one difference is `src/app/not-found.js` — see section 2.

## Verdicts

| # | Fix | Verdict |
|---|---|---|
| 1 | `NotFoundPanel` muted → foreground | **VERIFIED** (comment nit) |
| 2 | "Go to VNGeoGuessr" + comment position | **PARTIAL** — label shipped, rationale comment lost at 18:02:48 |
| 3 | Region 404 follows the OS | **VERIFIED** |
| 4 | Two `docs/game-flow.md` bullets | **VERIFIED** |
| 5 | `generateMetadata` copy | **VERIFIED**, two P4 nits |
| — | Prefetch no-change decision | **Accepted**, reasoning holds |

---

## 1. Contrast — VERIFIED, measured, not taken on trust

Tokens resolved from `src/app/globals.css`, oklch → sRGB:

| Token | Light | Dark |
|---|---|---|
| `--foreground` | `oklch(0.145 0 0)` = `#0a0a0a`, relLum 0.00305 | `oklch(0.985 0 0)` = `#fafafa`, relLum 0.95567 |
| `--surface` | `oklch(0.977 0.002 250)` = `#f6f7f9` | `oklch(0.115 0 0)` = `#050505` |
| `--muted-foreground` | `oklch(0.54 0 0)` = `#6f6f6f`, relLum 0.15746 | `oklch(0.75 0 0)` = `#aeaeae`, relLum 0.42188 |

Ground model: `.vn-surface` (`globals.css:285-287`) is
`color-mix(in oklab, var(--surface) 82%, transparent)` — i.e. `--surface` at
alpha 0.82 — composited over the fixed `AppBackground` key art
(`layout.js:59`, `public/bg.png`, 1536x1024). So
`ground = 0.82*surface + 0.18*art`, per channel, in sRGB, then WCAG relative
luminance. Panel region sampled = x 34–66%, y 30–70% (a centred `max-w-sm`
block); "whole" = every pixel.

**Method validated first**: the same script reproduces the prior report's
muted figures — light `text-muted-foreground`, centre: **min 3.11, avg 4.05**
(prior report: 3.09 / 4.05), 69.8% of pixels under 4.5:1. Method agrees, so its
output on `text-foreground` is trustworthy.

| Text | Theme | min | avg | max | % under 4.5:1 |
|---|---|---|---|---|---|
| `text-foreground` | light | **12.17** | 15.84 | 18.75 | 0.0 |
| `text-foreground` | dark | **12.28** | 15.58 | 19.62 | 0.0 |
| `text-muted-foreground` | light | 3.11 | 4.05 | 4.79 | 69.8 |
| `text-muted-foreground` | dark | 5.76 | 7.31 | 9.21 | 0.0 |

Art-independent bounds (worst possible pixel, not just this image):
light 12.17 (pure black art) … 18.75 (pure white); dark 12.28 (pure white) …
19.62 (pure black). **No art can push either theme below ~12:1.** AA at
14px/400 is cleared with ~2.7x headroom, and AAA (7:1) too. The report's
"~15:1" is the average and is accurate.

**Comment nit (P4, one clause).** `NotFoundPanel.js:25-28` states the muted
measurement without saying which theme. It is light-only: dark muted measures
5.76–9.21 and passes. As written, a later reader may "fix" dark on a premise
that was never true there.

```diff
-            an 82% veil that lets the background art through, where muted
-            measures 4.05:1 average and 3.09:1 at its worst -- under the 4.5:1
+            an 82% veil that lets the background art through, where muted in
+            the light theme measures 4.05:1 average and 3.09:1 at its worst --
+            under the 4.5:1
```

**Hierarchy — no regression.** `h1` is 24px/700, the `<p>` 14px/400: a 1.71x
size step plus 300 weight, and the `Button` below is a filled `bg-brand` block
(`button.jsx`, default variant, `h-11`). Three distinct ranks survive the colour
merge; the heading still leads. Full-strength body at 14px is the ordinary
choice — muted is for tertiary text, and this line is the page's only
explanation. The button is untouched and unaffected: its contrast is
`brand-foreground` on `bg-brand`, not on `vn-surface`.

Out of scope, noted once: the class the fix removed still sits on `vn-surface`
at `GameClient.js:388` (region name under the loading spinner), so it carries
the same light-theme 3.11–4.79 range. Pre-existing, not this diff, and it is a
transient label beside a full-strength one — but the prior report cited that
line as the consistency precedent, so the divergence is now deliberate rather
than accidental.

## 2. "Go to VNGeoGuessr" — PARTIAL

**Label: VERIFIED.** Reads well and fixes the finding — names the destination
rather than a "start" this visitor has never seen. Matches the concrete-label
pattern elsewhere ("Pick a region", "Back to menu").
`tests/e2e/routing.spec.js:160-161` asserts the new label plus `href="/"`.

**Comment: syntax VERIFIED, but it is no longer in the file.** In the reviewed
snapshot it was a `//` line comment at lines 7-10, above
`export default function NotFound()`, outside JSX entirely — the invalid
position the earlier attempt hit cannot recur there, and `eslint` on the four
changed files was clean. The settled 18:02:48 file (14 lines, 590 bytes) keeps
only the original "why this file exists" comment; the four lines explaining the
label are gone.

So the diff now ships a copy decision with no recorded reason — the same defect
class as the contrast comment this round set out to fix, one level milder.
Minimal fix, restore above line 7:

```js
//
// The action says "Go to VNGeoGuessr" rather than naming a start: this 404
// catches links from outside the app -- a mistyped path, a stale search result
// -- and that visitor has never seen one.
```

## 3. Region 404 follows the OS — VERIFIED

`src/lib/theme.js:81-84`: `watchSystemTheme(onChange)` adds a `change` listener
to `matchMedia('(prefers-color-scheme: dark)')` and returns the remover.
`game/[region]/not-found.js:26-30` calls `reapply()` once, then
`return watchSystemTheme(reapply)` — the returned unsubscribe becomes React's
cleanup, deps `[]`, so exactly one listener for the page's life and none leaked.

Against `ThemeToggle.js:33-39`: same API, same cleanup shape, one deliberate
difference — ThemeToggle subscribes only when `theme === 'system'` and applies
the literal `'system'`; the 404 subscribes unconditionally and re-reads
`getStoredTheme()` in the callback. For a light/dark storer the callback fires
and re-applies the identical class + `colorScheme` (`theme.js:66-72`) — an
idempotent no-op, on a page with no other state. Correct, and simpler than
mirroring ThemeToggle's guard on a page that holds no theme state to guard on.

A `'system'` visitor flipping OS appearance now updates: `resolveDark`
(`theme.js:56-58`) reads `matchMedia().matches` at callback time, not at mount.
The bug is closed.

## 4. `docs/game-flow.md` — VERIFIED

Both bullets checked against code, not against the fix report.

- **Re-casing only.** `regionFromSlug` (`src/lib/regions.js:75-80`) round-trips
  `regionSlug(code) === raw.toLowerCase()`. Executed against the real tree:
  `hn-badınh` (U+0131) → `null`, `hn-ſontay` (U+017F) → `null`,
  `HN-BADINH` / `Hn-BaDinh` → `HN-BADINH`. Pinned by
  `tests/regions.test.js:58-64` and `tests/e2e/routing.spec.js:108-115`
  (percent-encoded request). `npx vitest run tests/regions.test.js` → 27 passed.
  The bullet's "its own cache entry and its own analytics row" matches the
  stated reason for the region-in-path change itself.
- **Per-region titles.** Matches `generateMetadata`; strings reproduced below.

Caveat, not a docs error: at 17:57 the tree briefly held the guard's comment
without its body, which would have made this bullet false. Restored since.

## 5. `generateMetadata` copy — VERIFIED, two P4 nits

Generated from the real tree (all 85 resolve; no duplicate display names):

```
VN         Vietnam — VNGeoGuessr      | Guess where you are in Vietnam, from street view.
HN         Ha Noi — VNGeoGuessr       | Guess where you are in Ha Noi, from street view.
HN-BADINH  Ba Dinh — VNGeoGuessr      | Guess where you are in Ba Dinh, Ha Noi, from street view.
TPHCM-Q7   District 7 — VNGeoGuessr   | Guess where you are in District 7, Ho Chi Minh, from street view.
```

- **Tab / history / bookmark legibility — good.** Titles run 19–28 chars
  (shortest `Ba Vi — VNGeoGuessr`, longest `Thanh Hoa City — VNGeoGuessr`). The
  region is first, so a crowded tab truncating at ~18 chars keeps the region and
  drops the brand — the right thing to lose. A bookmark takes the full title.
  `District 7 — VNGeoGuessr` is the weakest case, but the province is one line
  down in the description and the URL carries `tphcm-q7`.
- **Em dash — keep.** `src/app/credits/page.js:7` is already
  `Credits — VNGeoGuessr`. The new titles follow an existing pattern rather than
  starting a second one; changing it would mean changing both.
- **Reveals nothing.** The description names only the region already in the URL,
  in the picker, and in the game chrome (`GameClient.js:389`). The protected
  facts per CLAUDE.md — coordinates and the district a panorama resolved to —
  are nowhere near it. On a province page it names the province, not the answer
  district. Safe.
- **Nit (P4), voice:** root metadata says "GeoGuessr for **VietNam**"
  (`layout.js:20-22`); the new copy says "Vietnam", from the region tree. Two
  spellings of the country on one site. The tree's is the correct one — fix the
  root, not this.
- **Nit (P4), rhythm:** where `place` has no comma the sentence reads "in
  Vietnam**,** from street view." — a pause the two-part places need and the
  one-part places do not. Permissible either way; not worth a conditional.
  Leave it.
- **Comment nit:** `page.js:48-49` says "Outermost first". The output is
  narrowest first — `Ba Dinh, Ha Noi`, address order. Say "narrowest first" or
  "address order".

Code-side facts confirmed: resolves via `regionFromSlug`; returns `{}` on an
unknown slug so `/game/notaregion` inherits root metadata and still 404s
(`getRegion` would have thrown → 500); both new imports used; `place` falls back
to `name` for `VN`, where `regionPath(...).slice(1)` is empty.

## Prefetch (#4 prior) — no-change decision accepted

Not re-measured, as instructed. The reasoning is sound: `prefetch="auto"` fires
on **viewport entry**, so mounting 30 `AccordionContent` rows is not 30 fetches
— only the handful on screen. That is exactly why the feared "85 on one expand"
did not appear. The numbers are internally consistent (39 × ~2.7 KB ≈ 107 KB),
and 2.7 KB of RSC payload against panorama imagery an order of magnitude larger
is the right trade for instant navigation on the picker's primary action. One
caveat that does not change the verdict: the measurement was one viewport; a
visitor scrolling a long district list fires more as rows enter, still bounded
by rows actually seen, still far below 85. Accept the default.

## New regressions found

One, and it is not from the fixes themselves: the lost rationale comment in
`src/app/not-found.js` (section 2), collateral from whatever wrote that file at
18:02:48. Minimal fix is the four-line block quoted there. Nothing else
regressed: no
token, spacing, semantic, focus, touch-target or motion behaviour changed in
this diff, and `NotFoundPanel`'s wrapper, `Button` usage and `<h1>` are
untouched.

## Unresolved questions

1. Who is editing the tree? It settled correctly at 18:02:48 minus one comment,
   so this looks like a mutation-test loop that lost a hunk on restore. If more
   writes land after 18:03, re-diff before commit — my verdicts are pinned to
   the content quoted in this report, not to the paths.
2. The region 404's theme comment says Next's error shell does not carry the
   root layout, yet the new e2e footer assertion (`Made by`) passes on that same
   page — which means the layout *does* attach. Both cannot be literally true.
   The `useEffect` is harmless either way (idempotent), but the comment may be
   describing a Next behaviour that has since changed. Worth one check by
   whoever owns that file.
3. No `openGraph` on the region pages, so a shared `/game/hn-badinh` link
   previews from the `<title>`/`description` fallback only. Consistent with the
   root, which has none either. Out of this diff's scope — flagging, not
   proposing.
