# UI/UX review — region 404 surface

Date: 2026-09-06
Branch: `feat/game-region-path-segment` (uncommitted)
Subject: `src/app/game/[region]/not-found.js` and the error surfaces around it
Mode: report only — no file changed. `.next-check` build artifact created and removed; dev/prod servers stopped.

## Verdict

The page is **well judged as copy and as an interaction**. Two real defects sit
under it, one of them invisible in code review:

1. **P1 — it always renders in the light palette**, whatever the visitor's theme.
   Measured in `next dev` *and* in a production build. Not caused by this file.
2. **P2 — the page has no heading element at all.** Every other page in the app
   has a real `<h1>`. One-word fix, zero visual change.
3. **P2 (adjacent) — the app-wide 404 is illegible.** `/nosuchpath` falls to
   Next's stock 404, which paints unstyled text straight onto the full-bleed key
   art. Pre-existing, but this branch is the first time anyone has looked at 404s.

Everything else — copy, single action, destination, focus order, touch target,
responsive behaviour — checks out.

## How this was verified

`npm run dev` on :3000 and `npm run build:check` + `next start` on :3100.
Playwright drove real page loads at 320/390/640/768/844/1280/1920 widths, with
`vngeoguessr_theme` seeded in `localStorage` and `prefers-color-scheme` set per
context. Contrast was measured by compositing the actual `AppBackground` art
under the live `.vn-surface` veil in-page and sampling each text node's own
bounding box, rather than by comparing tokens on paper.

---

## 1. Does the 404 do its job?

Yes.

- **Copy is honest.** "That link points at a region that doesn't exist. It may
  have been mistyped or cut short." names the two ways a visitor actually gets
  here. "Cut short" is the better half of that sentence — truncated links from
  chat apps are the common case and most 404 copy never mentions it.
- **Deliberately not listing valid codes** is right, and the WHY comment already
  records it.
- **"Pick a region" is the right label.** It names the next action rather than
  the destination ("Home", "Go back"). `/` is the correct target: `RegionPicker`
  lives there, so the label and the landing match.
- **One thing on the page** is right for a dead-end URL.

Two things it does not do, both correctly rejected:

- **It never echoes the bad code.** "VNGeoGuessr has no region called
  `TPHC`" would help a visitor spot a truncation. It is not cheap here:
  `not-found.js` accepts no props (verified, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`,
  "Props" section), so reading the segment means `usePathname` and a client
  component. Not worth it on a rarely-hit page. Worth one line of WHY comment so
  the next reader does not re-litigate it.
- **The tab title stays "VNGeoGuessr".** `not-found.js` cannot export `metadata`
  — only `global-not-found.js` can (same doc, "Metadata" section, and
  `globalNotFound` is still experimental). Accept it.

## 2. Consistency with `GameClient`'s `loadError` panel

**One action is correct here; do not mirror the two-action shape.** The two
panels answer different questions:

| | `GameClient` `loadError` | region 404 |
|---|---|---|
| cause | a fetch that failed *this time* | a URL that is deterministically invalid |
| "Try again" | can succeed | can never succeed |
| exit | `Back to menu` | `Pick a region` |

Offering "Try again" on a 404 would be a button that is guaranteed to reproduce
the same page. That is the dishonest option, not the consistent one.

Where the two *do* differ and it is fine:

- `loadError` uses fixed `text-neutral-*` because it sits on the opaque
  `bg-neutral-900` panorama surround; the 404 uses theme tokens because it sits
  on `vn-surface`. Both right for their ground.
- `loadError` carries `role="alert"`; the 404 does not, and should not — it is a
  whole document, not a live region inside a running one.
- Two labels for the same `/` destination ("Back to menu" vs "Pick a region").
  Leave it. "Back to menu" reads correctly mid-game; "Pick a region" reads
  correctly to someone who was never in a game.

The one genuine borrowing that is wrong is discussed next: the 404 copies
`loadError`'s `<p className="text-lg font-semibold">` heading-shaped paragraph,
and that choice does not transfer.

## 3. Accessibility

### P2 — no heading element on the page

Measured on the live page:

```
document.querySelectorAll('h1,h2,h3,h4,h5,h6')  ->  []
```

ARIA snapshot of the whole document:

```
- paragraph: No such region
- paragraph: That link points at a region that doesn't exist. ...
- link "Pick a region": /url: /
- contentinfo: ... (DebugFooter)
```

A screen-reader user landing here has nothing in the rotor and nothing for the
`H` key. Every other page in the app has a real `<h1>` (`page.js:136`,
`credits/page.js:51`, `debug/page.js:29`, `debug/bbox/page.js:158`,
`debug/coverage/page.js:171`), so this is the odd one out.

The `<p>` here is inherited from `GameClient`'s error panel, where a paragraph
*is* right — that panel is an in-place alert inside a page that already owns its
heading structure. A `not-found.js` rendered into the root layout owns the whole
document. Different context, opposite answer.

Fix — Tailwind preflight resets heading size and weight, so `text-2xl font-bold`
already carries the visuals and this is a **pixel-identical** change:

```diff
-        <p className="text-2xl font-bold text-foreground">No such region</p>
+        {/* A real h1: this renders as the whole document, not as an in-place
+            panel inside a page that already has one. */}
+        <h1 className="text-2xl font-bold text-foreground">No such region</h1>
```

### Focus order and targets — pass

Tab order: `Pick a region` → footer credit → commit sha → copy button. Nothing
above the content steals first focus. The link measured **109 × 44 px**, meeting
the 44px floor the `Button` `size` variants exist to guarantee.

### Contrast — one measured failure, pre-existing and app-wide

Composited against the real key art under the `.vn-surface` veil:

| element | size/weight | avg | worst | needs | result |
|---|---|---|---|---|---|
| "No such region" | 24px / 700 | 15.2:1 | 12.1:1 | 3:1 | pass |
| explanatory paragraph | 14px / 400 | **4.05:1** | **3.09:1** | 4.5:1 | **fail** |

This is not something the 404 introduced. The home hero subtitle
(`page.js:139`, `text-lg text-muted-foreground`) measures 3.81–4.07:1 by the
same method. It is the app-wide `--muted-foreground` on translucent
`.vn-surface` over a high-chroma illustration problem, and fixing it properly is
a separate token/veil decision, not this branch's job.

Worth noting only because the 404 is the one surface where that sentence is the
*only* explanation available, and unlike home it has no opaque `Card` behind it.
If a cheap local remedy is wanted, both use existing pieces:

```diff
-        <p className="text-muted-foreground text-sm">
+        <p className="text-foreground text-sm">
```

(measures ~15:1) — or wrap the block in the existing shadcn `Card`, whose opaque
`bg-card` is exactly how home makes its real content readable. Either is
optional; neither is a blocker.

### Other

- `lang` is missing from the initial 404 document (`<html id="__next_error__">`
  with no `lang`; React fills it during hydration). Framework behaviour, see §4.
  Not fixable from this file. Note only.
- `animate-fade-in-up` is already neutralised under `prefers-reduced-motion`
  (two rules in `globals.css`). Correct.
- No `<main>` landmark — but no page in the app outside `debug/layout.js` has
  one, so adding it here alone would be the inconsistency. Out of scope.

## 4. Theme — P1, the page is permanently light

Stored theme `dark`, OS `prefers-color-scheme: dark`, production build:

```
PROD /                  html.class="dark"   body bg dark
PROD /game/TPHCM        html.class="dark"   body bg dark
PROD /game/NOTAREGION   html.class=""       body bg #fff   <-- light
PROD /nosuchpath        html.class="dark"   (stock 404 overrides with its own inline styles)
```

Same result under `next dev`. A dark-theme visitor goes from a dark home page to
a white 404.

**Cause.** Next serves a thrown `notFound()` as an error shell:

```html
<!DOCTYPE html><html id="__next_error__"><head> ... no lang, no theme script ...
```

The root layout — including the pre-paint `<head>` script from `layout.js:39-52`
— arrives only in the RSC flight payload and is attached during hydration.
Confirmed on the live page: the script element **is** in `document.head`
afterwards, but never ran —

```
colorScheme: ""            // applyTheme's other side effect, also absent
headScripts: [ ..., "(function(){try{\nvar c=localStorage.getItem('vngeo" ]
```

An inline `<script>` inserted into the DOM after parse does not execute. That is
browser behaviour, not a Next bug, and it is why the class never lands.

This only affects a **hard load** of the bad URL. A soft navigation keeps
whatever class the current document already has. A hard load is exactly the
scenario this page exists for — a shared link opened cold.

**Options, in ascending cost:**

- **(a) Accept and document it.** One WHY comment on the file saying the page
  renders in the light palette because a thrown `notFound()` is served from the
  error shell, so the pre-paint theme script never runs. Honest, zero risk, and
  proportional for a page that is hit by accident. My recommendation unless the
  theme mismatch bothers you.
- **(b) Re-apply the theme after mount.** A small `"use client"` component whose
  only effect is `applyTheme(getStoredTheme())` — both already exported from
  `src/lib/theme.js`, no new dependency, no new token. Correct colours after
  hydration, at the cost of a visible light→dark flip on this one page and a new
  file for a rare surface. Note that rendering `<ThemeToggle />` here would fix
  it as a side effect (`ThemeToggle.js:33-40` calls `applyTheme` on mount), but
  putting a settings control on an error page to get a colour right is the wrong
  reason to ship a control.
- **(c) `experimental.globalNotFound`.** Would also buy a real `<title>`. Costs
  an experimental flag and a duplicate of the global styles/fonts/theme setup.
  Not worth it for this.

## 5. Responsive — pass, nothing to change

No horizontal or vertical overflow at any size tested; the page never scrolls,
which matches the game surface's non-scrolling intent, and the footer stays in
its own strip below the content.

```
320x568   hScroll=false vScroll=false
320x480   hScroll=false vScroll=false
640x360   hScroll=false vScroll=false   (landscape phone — content + footer still fit)
768x1024  hScroll=false vScroll=false
1920x1080 hScroll=false vScroll=false
```

`flex-1` + `items-center` inside the root `min-h-dvh` column does the right
thing at every size, and `max-w-sm` keeps the sentence at a readable measure on
desktop instead of stretching it. `p-6` with centred content means the missing
`env(safe-area-inset-*)` padding is not reachable — a notch cannot touch a
centred `max-w-sm` block.

One observation, not a defect: on desktop the content is a small island in the
middle of full-bleed key art, and the art wins the composition. That is the
`vn-surface` treatment working as designed everywhere else too; only mentioned
because here there is no header, no wordmark, and no card to anchor the eye. If
you want the page to read as *this app's* 404 rather than as generic text over
an illustration, the cheapest move is the same wordmark header
`credits/page.js:41-49` already uses. Optional.

## 6. The missing app-wide `not-found.js` — a real gap, and worse than "missing"

There is no `src/app/not-found.js`, so `/nosuchpath`, `/credits/x`, `/debug/x`
and every other unmatched URL (all correctly returning 404) fall to Next's stock
page. Rendered against this app that is not merely plain — it is **illegible**:
"404 | This page could not be found." paints in the stock inline styles directly
over the full-bleed key art, with no `vn-surface` veil, no footer, and **no link
out at all**. Its `100vh` wrapper also pushes `DebugFooter` off-screen, so the
visitor has no in-page way back to the app. Captured at 1280×800 in both light
and dark; the text is essentially invisible either way.

**Is it in scope for this change?** Strictly, no — this branch created the
region 404, not the app-wide gap, and shipping without it leaves things no worse
than `main`. But it is ~15 lines reusing the component you just wrote, it is the
one 404 a search engine or a mistyped domain path will actually reach, and this
branch is the first time the project has had a 404 opinion at all. **My call:
do it now if the branch can take one more file; otherwise a named follow-up, not
a "someday".**

A useful asymmetry if you do: `/_not-found` prerenders **inside** the root
layout, so the pre-paint theme script runs there — verified, `html.class="dark"`
on `/nosuchpath`. An app-wide `not-found.js` would therefore be theme-correct
where the region one is not. Unverified caveat: a thrown `notFound()` from a
route segment would almost certainly still be served from the error shell and
stay light, so adding the root file does **not** fix §4. Worth a five-minute
check before relying on either claim.

Sketch, existing components and tokens only:

```jsx
// src/app/not-found.js
import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Every URL the app does not route, including a mistyped path someone shared.
// Next's stock 404 paints unstyled text straight onto the key art with no way
// back, so this exists mainly to give that visitor a link out.
export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center vn-surface p-6">
      <div className="text-center space-y-4 max-w-sm animate-fade-in-up">
        <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
        <p className="text-foreground text-sm">
          That link doesn&apos;t go anywhere in VNGeoGuessr. It may have been
          mistyped or cut short.
        </p>
        <Button asChild>
          <Link href="/">Back to VNGeoGuessr</Link>
        </Button>
      </div>
    </div>
  );
}
```

Note the near-duplication with the region 404 is deliberate, not a DRY
violation to solve: the two say different things ("no such region" vs "no such
page") and one extra shared component for eight lines of markup would cost more
than it saves.

## Recommended order

| # | Change | Priority | Cost |
|---|---|---|---|
| 1 | `<p>` → `<h1>` in `game/[region]/not-found.js` | P2, do it | one word, zero visual change |
| 2 | Add `src/app/not-found.js` | P2, do it or name the follow-up | ~15 lines |
| 3 | WHY comment recording the light-palette behaviour (§4 option a) | P3 | one comment |
| 4 | `text-muted-foreground` → `text-foreground` on the explanatory line | P3, optional | one class |
| 5 | Wordmark header for brand anchoring | P4, optional | ~6 lines |

Copy is free to change: `tests/e2e/routing.spec.js:96-97` asserts the status
code only and says so in its comment.

## Unresolved questions

1. **Theme (§4):** accept the light-only 404 with a comment (a), or add the
   mount-time re-apply and its visible flip (b)? Needs your call on whether the
   mismatch is worth a new file on a rarely-hit page.
2. **App-wide `not-found.js` (§6):** this branch or a follow-up?
3. Does the root `not-found.js` also swallow a thrown `notFound()` from
   `[region]/page.js`, or does the segment-scoped file still win? Not tested —
   testing it means adding the file, which this review could not do.
