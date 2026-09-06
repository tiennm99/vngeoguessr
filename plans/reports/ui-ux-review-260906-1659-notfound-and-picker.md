# UI/UX review — 404 surfaces + region picker

Date: 2026-09-06
Branch: `feat/game-region-path-segment` (clean, HEAD 6d7cb30) vs `main`
Scope: presentation layer of `git diff main...HEAD -- src`. Report only, no file changed.
Method: source + `node_modules/next/dist/docs` only. No build, no browser, no screenshots.
Prior: `plans/reports/ui-ux-review-260906-1522-region-404-surface.md`.

## What the prior report asked for, and what happened

| Prior finding | Status now |
|---|---|
| P2 no heading element | **Fixed** — `NotFoundPanel.js:24` is a real `<h1>` |
| P2 no app-wide 404 | **Fixed** — `src/app/not-found.js` added |
| P1 region 404 always light | **Fixed** — option (b), `game/[region]/not-found.js:22-24`, e2e at `routing.spec.js:126-138` |
| P3 explanation contrast | **Not fixed** — still true, and now on both 404s. See #1 |
| P4 wordmark header | Not done. Fine, was optional |

---

## Findings

### 1. P2 — the explanation line fails AA, and the comment beside it says it doesn't

`src/app/components/NotFoundPanel.js:25-28`

```
{/* text-muted-foreground on this size sits near the AA floor; ... */}
<p className="text-muted-foreground text-sm">{children}</p>
```

Symptom: the one sentence telling the visitor what went wrong is the least
readable thing on the page. Measured in the prior review by compositing the real
`AppBackground` art under the live `.vn-surface` veil (`globals.css:286`, surface
at 82% — 18% of a high-chroma illustration bleeds through): **4.05:1 average,
3.09:1 worst**, against the 4.5:1 AA needs at 14px/400. The heading and the
button clear it; this line does not. Unlike `page.js:139`, there is no opaque
`Card` behind it here.

The comment is the reason to raise this rather than let it stand: it records a
decision from a premise the measurement contradicts. "Near the floor" and "below
the floor" are different decisions. Reach also widened — this class now serves
the app-wide 404, the one a search engine or mistyped domain path reaches.

Fix (one class, plus correct the comment):

```diff
-        <p className="text-muted-foreground text-sm">{children}</p>
+        <p className="text-foreground text-sm">{children}</p>
```

`text-foreground` measures ~15:1 on the same ground.

### 2. P3 — the region 404's centring is unverified, and its test is the one that skips the check

`src/app/components/NotFoundPanel.js:22` — `flex-1` needs the root layout's
`flex min-h-dvh flex-col` (`layout.js:67`) to do anything. The region 404 is
served from Next's error shell, which is exactly the wrapper this branch already
knows the shell does not carry (the theme comment at `not-found.js:13-16` says
so). Post-hydration the layout attaches and it centres; whether it centres in the
first paint is untested.

Symptom if it doesn't: the panel renders collapsed at the top of the viewport for
one frame instead of centred — on the same page that already flips light to dark.

The root-404 test asserts this and says why (`routing.spec.js:145-147`, "The
footer proves it rendered inside the root layout"). The region-404 test
(`routing.spec.js:126-138`) asserts heading, link and theme but not that.

Fix — one line into the region test, same assertion, same reason:

```diff
   await expect(page.locator('html')).toHaveClass(/dark/);
+  await expect(page.getByText('Made by')).toBeVisible();
```

### 3. P3 — "Go to the start" names nothing the visitor has seen

`src/app/not-found.js:9`

Symptom: this 404 catches links from outside the app — a mistyped path, a stale
search result. That visitor has not seen a start. The region 404's "Pick a
region" names the action; "the start" names neither the action nor the
destination. Every other exit label in the app is concrete ("Back to menu",
`GameClient.js:464`).

Fix (`routing.spec.js:144` asserts the label — update both):

```diff
-    <NotFoundPanel title="Page not found" actionLabel="Go to the start" actionHref="/">
+    <NotFoundPanel title="Page not found" actionLabel="Go to VNGeoGuessr" actionHref="/">
```

### 4. P3 — one prefetch target became 85. Flagging, not asserting

`src/app/components/RegionPicker.js:53` — `href = /game/${regionSlug(code)}`.

Next 16 default `prefetch="auto"` full-prefetches **static** routes on viewport
entry (`link.md:302-303`), and `generateStaticParams` prerenders every region
(`game/[region]/page.js:12-14`). `AccordionContent` unmounts when closed
(`accordion.jsx:48-62`, no `forceMount`), so expanding one province mounts all
its district Links at once — each now a distinct static route. Before, every row
in the picker pointed at the single `/game` route.

Symptom, if real: a burst of prefetches on mobile data when a province opens.
Unmeasured — App Router prefetch dedup across query strings vs routes is not
something source reading settles, and this is a map game where the bandwidth
matters. Measure the network panel on one province expand before touching it.

Fix only if measured bad, one prop on `PlayRow`'s Link:

```diff
       href={href}
+      prefetch={false}
```

### 5. P4 — accepted, noted so nobody re-litigates

- **Tab title stays "VNGeoGuessr" on both 404s.** `not-found.js` cannot export
  `metadata`; only `global-not-found.js` can (`not-found.md:185`), which costs an
  experimental flag plus a duplicate of the styles/fonts/theme setup. Accept.
- **Light-to-dark flip on the region 404.** Documented at
  `game/[region]/not-found.js:13-21`, tested at `routing.spec.js:126`. Right call
  over the alternatives, and the comment is the best kind — it explains why the
  file is a client component at all.
- **"Pick a region" lands on `/`, which auto-opens `UsernameModal` for a nameless
  visitor** (`page.js:49-53`). The way out works; it just greets with a modal.
  Pre-existing home behaviour, not this diff's.
- **No `<main>` landmark; no `lang` on the error shell's `<html>`.** App-wide and
  framework respectively, unchanged here.

---

## Verified good

**Theme (the 6d7cb30 claim holds).** Root 404 prerenders inside the root layout,
so the pre-paint script at `layout.js:39-52` runs — no client code needed, and
`not-found.js` correctly stays a server component. Region 404 is served from the
shell that script never reaches, so it re-applies at `not-found.js:22-24` via
`applyTheme(getStoredTheme())` — which also sets `colorScheme` (`theme.js:73`),
the part a bare `classList` toggle would miss. `routing.spec.js:126-138` pins it
with a dark-seeded context.

**`NotFoundPanel` forces no theme onto either context.** Every colour is a
semantic token — `text-foreground`, `text-muted-foreground`, `vn-surface`,
Button's `bg-brand` — and there is no `dark:` override, no fixed `neutral-*`. One
component genuinely serves both grounds. Contrast with `GameClient.js:457-458`,
which is right to use fixed `text-neutral-*`: it sits on the opaque
`bg-neutral-900` panorama surround, not on `vn-surface`.

**Every dead end has a real exit.** Both panels point at `/`, which is
`src/app/page.js`. `/game` goes to `/game/vn`; legacy `?region=UNKNOWN` goes to
`/game/unknown`, which 404s to `/`. No loop, no 404 without a link.

**Semantics.** `<h1>` at `NotFoundPanel.js:24` — Tailwind preflight already
resets heading size, so `text-2xl font-bold` carries the visuals unchanged.
`Button asChild` + `Link` renders a real `<a href>`, the right element for a
navigation. Neither 404 has an icon-only control, so no `sr-only` text is owed.
No `role="alert"` on either, correctly — a not-found route is a document, not a
live region inside a running one.

**Focus and touch.** Base ring `focus-visible:ring-[3px] ring-ring ring-offset-2
ring-offset-background` (`button.jsx:19`), opaque by design and documented at
`button.jsx:11-13`. Default size is `h-11` = 44px (`button.jsx:38-40`), so the
sole tap target meets the floor without a call-site patch.

**Motion.** `animate-fade-in-up` is neutralised under `prefers-reduced-motion` by
both blocks (`globals.css:334-343` and `348-356`).

**Responsive.** `flex-1` + `items-center` + `max-w-sm` + `p-6`. `max-w-sm` keeps
the sentence at a readable measure on desktop; a centred `max-w-sm` block cannot
reach a notch, so the missing `env(safe-area-inset-*)` is unreachable rather than
forgotten. Content height at 640x360 landscape (h1 + 2 lines + 44px button +
gaps + padding, roughly 200px) clears the viewport minus the 36px footer strip.

**Consistency — no divergence found.** The wrapper
`flex-1 flex items-center justify-center vn-surface` is verbatim
`GameClient.js:385` and the deleted `GameLoadingFallback`.
`text-center space-y-4 max-w-sm` is verbatim `GameClient.js:454`.
`text-muted-foreground text-sm` matches `GameClient.js:388`. `Button` is used
with default variant and size and zero overrides — exactly what `button.jsx:7-10`
asks call sites to do.

**RegionPicker.** One line. No visual or semantic change; the row stays a single
`<Link>` with the "Play" pill as a `<span>`, so no nested interactive. Routing
`regionSlug` through `lib/regions.js` keeps the picker, `generateStaticParams`
and the legacy redirect on one casing — which is the whole point given the
analytics constraint.

**GameClient.** Losing `Suspense` + `GameLoadingFallback` is a net improvement,
not a regression: `initialLoading` starts `true` (`GameClient.js:65`), so the
same spinner now server-renders — and with the real region name
(`GameClient.js:389`) instead of a generic "Loading game...". `key={code}`
(`game/[region]/page.js:41`) covers region-to-region remount.

---

## Order

| # | Change | Priority | Cost |
|---|---|---|---|
| 1 | `text-muted-foreground` to `text-foreground`, fix comment (`NotFoundPanel.js:28`) | P2 | one class |
| 2 | Footer assertion in the region-404 test (`routing.spec.js:137`) | P3 | one line |
| 3 | "Go to the start" to a concrete label (`not-found.js:9` + `routing.spec.js:144`) | P3 | two strings |
| 4 | Measure picker prefetch on province expand | P3 | measure first |

## Unresolved questions

1. **#1 contrast** — the comment records a deliberate accept, but from a premise
   the measurement contradicts. Change the class, or keep the trade-off and
   rewrite the comment to state the real ratio? Author's call, not mine.
2. **#4 prefetch** — worth a network-panel check on one province expand, or not a
   concern at this traffic?
