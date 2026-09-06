---
name: windows-isr-case-collision
description: next start on this Windows/NTFS box corrupts ISR cache for case-variant dynamic-segment redirects — do not trust local production-build smoke tests for this
metadata:
  type: project
---

Proven 2026-09-06 while investigating `feat/game-region-path-segment`
(`src/app/game/[region]/page.js`): this machine's NTFS filesystem is
case-insensitive. When a Next 16 App Router page under `generateStaticParams`
+ default `dynamicParams: true` gets an on-demand request whose dynamic
segment differs only in case from an already-prebuilt param (e.g.
`/game/la` vs. the prebuilt `/game/LA`), the ISR disk cache lookup
case-folds and serves the prebuilt file directly — bypassing the page's own
logic entirely (here, a lowercase-to-canonical `redirect()`). Worse, the
background revalidation this triggers then overwrites the *canonical*
page's cache file with a cached `redirect()` response that is missing its
`Location` header, permanently breaking the canonical URL for that server
process (confirmed: `200` on first case-variant hit, then `307` with no
`Location` header on both casings afterward, `ETag` identical).

**Why:** filesystem-level case folding is Windows/NTFS-specific; Vercel
(Linux, its own cache-key store) should not have this collision, so it did
not block shipping — but any redirect/dynamicParams acceptance criterion
tested via `npm run build:check && next start` **on this machine** is
unreliable and order-dependent, not a real signal.

**Resolved in the code:** the region route no longer redirects at all — slugs
are lowercase and any casing serves directly — so there is no cached redirect
on a prerendered route to corrupt. The verification guidance below still
applies to any future route that does redirect.

**How to apply:** when a task asks to verify redirect or dynamicParams
behavior for a Next.js App Router dynamic segment locally, either use `next
dev` (no ISR cache, always re-executes) or verify against an actual Vercel
preview / Linux CI, not a local Windows `next start`. If a "smoke test looks
broken after a build" surprise recurs for a route with case-variant dynamic
segments, check this first before assuming a code regression. Full writeup:
`plans/reports/debugger-260906-1523-region-path-runtime-edges.md`.
