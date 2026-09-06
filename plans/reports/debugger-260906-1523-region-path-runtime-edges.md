---
title: "Runtime/edge-case investigation: game region path segment"
plan: plans/260906-1122-game-region-path-segment/plan.md
branch: feat/game-region-path-segment
investigated: 2026-09-06
status: DONE_WITH_CONCERNS
---

# Runtime and edge-case behavior: `/game/[region]`

Report-only, no files modified. Verified via `npm run build:check` (writes to
`.next-check/`, gitignored) plus `npx next start` on port 3100 (production
mode), probed with `curl`. Server killed and port confirmed free afterward.
Read the plan and the prior code review first per instructions; findings below
are new, not repeats of `plans/reports/code-reviewer-260906-1237-game-region-path-segment.md`.
The three review recommendations I could check statically (H1 encode, M1 JSDoc,
M2 `key={code}`, M3 `not-found.js`) are all already applied in the tree — no
new comment on those.

## Finding 1 (PROVEN, environment-specific) — Windows/NTFS case-insensitivity corrupts the ISR cache for canonical region pages

**Mechanism, proven directly:**

```
node -e "const fs=require('fs'); fs.writeFileSync('.next-check/CASETEST.txt','x');
console.log(fs.existsSync('.next-check/casetest.txt'));"
→ true
```

This filesystem (NTFS, this machine) is case-insensitive. `src/app/game/[region]/page.js:35`
implements D3 by calling `redirect()` only for a case-mismatched request
(`/game/hn` → `/game/HN`). Because `dynamicParams` defaults to `true`
(confirmed: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/dynamicParams.md:16`
— "Dynamic route segments not included in `generateStaticParams` are generated
at request time"), `/game/hn` is not one of the 85 prebuilt params (only
canonical-case codes are, from `generateStaticParams` at `[region]/page.js:14`),
so Next's on-demand ISR path handles it — and that path writes/reads disk
cache files keyed by the literal segment string (e.g. `game/hn.html`).

Reproduced cleanly with a code untouched by any prior request in the session
(`LA`, a real top-level province):

1. `curl /game/la` (first-ever hit, case differs from disk file `LA.html`
   written by `generateStaticParams`) → **`200 OK`, `x-nextjs-cache: STALE`,
   `Content-Length: 16304`** — the full game-shell HTML for `LA`, at the wrong
   URL, with **no redirect at all**. The case-insensitive lookup for
   `game/la.html` resolved to the already-existing `game/LA.html` and served it
   directly before `GameRegionPage`'s own redirect logic ever ran. This is a
   stale-while-revalidate hit, so a background regeneration is scheduled.
2. ~1s later, **both** `/game/LA` (canonical!) and `/game/la` return
   **`307 Temporary Redirect`, `Content-Length: 10895`, identical `ETag`,
   `x-nextjs-cache: HIT`** — and the `307` response has **no `Location`
   header at all** (confirmed by full header dump; curl `-L` follows 0
   redirects, `num_redirects=0`). The background regeneration, run under the
   `la` request's param, wrote its (mis-cased-as-canonical) redirect response
   to the same physical file NTFS resolves for both `LA.html` and `la.html`,
   and a statically-cached ISR entry does not carry a live per-request
   `Location` header the way a real `redirect()` throw does — so the canonical
   URL is now **permanently broken**: it serves neither the game nor a working
   redirect, for as long as that server process and disk cache live.
3. Confirmed the same with `HN` (touched earlier in the session) and `DL`
   (touched via a legacy `?region=` redirect) — identical symptom in both
   cases: canonical `/game/HN` and `/game/DL` end up serving the headerless
   307 once their lowercase counterpart is requested.

**Scope of proof:** proven on this machine, this filesystem, `next start`
against a real production build. **Not proven, and considered unlikely, on
Vercel**: Vercel's build and runtime are Linux (case-sensitive filesystem),
and Vercel's ISR/Data Cache is keyed by exact pathname strings in its own
storage layer, not a literal case-folding filesystem path — so `/game/hn` and
`/game/HN` should remain distinct cache entries there and this exact collision
should not reproduce in production. I did not have a Vercel/Linux environment
to confirm that negative directly.

**Why this still matters:**
- The plan's own acceptance criterion "`/game/hn` redirects to `/game/HN`"
  (plan.md:175) and the routing e2e spec that asserts it were presumably
  verified via `npm run dev` (no ISR cache — every request re-executes the
  page function live, so `next dev` cannot show this), not via `next start`.
  If anyone re-verifies these acceptance criteria locally on this Windows box
  using `next build && next start` (the mode closest to production), the
  results will be **wrong and nondeterministic** depending on request order
  and cache warmth — a first-touch lowercase hit silently serves the wrong
  region's content at the wrong URL with `200`, and any subsequent hit to
  either casing serves a broken, headerless `307`. This is a genuine
  local-verification hazard specific to this team's OS (CLAUDE.md/env: Windows
  11), independent of whether it ever affects production.
- Recommend: never trust `next start` on Windows to validate this route's
  redirect/cache correctness; verify via a Vercel preview deployment (or a
  Linux CI runner) instead. Worth a one-line note in the plan or a code
  comment near `generateStaticParams` so a future "let's smoke-test the build
  locally" instinct doesn't waste time chasing a phantom bug — or file a
  report to the Next.js team, since caching a thrown `redirect()` as static
  ISR output with no `Location` header is arguably a framework defect
  independent of the OS trigger.

## Finding 2 (PROVEN) — a correctly-executed `[region]` redirect is cached at the edge for a year; the legacy `/game?region=` redirect is not

Headers captured before any contamination, both genuinely executed their own
redirect logic:

- `/game?region=TPHCM` (legacy handler, `src/app/game/page.js:51`, dynamic
  route `ƒ`) → `307`, `Cache-Control: private, no-cache, no-store, max-age=0,
  must-revalidate`. Never cached by a CDN or browser — every hit re-executes.
- `/game/hn` → `/game/HN` (D3 handler, `[region]/page.js:35`, ISR-backed
  dynamic segment) → `307`, `Cache-Control: s-maxage=31536000` (1 year).

This is standard behavior for an on-demand-generated page under App Router
ISR (the redirect response is cached the same way the page's real output would
be), and it is arguably the *intended* effect of D3 — one redirect executed
once per region-casing pair, then served identically to everyone after, no
different from any other ISR page. Flagging it because:
- It is asymmetric with the legacy path's explicit `no-store` — the two "same
  purpose" redirects in this codebase behave oppositely under caching, for a
  reason that is not stated anywhere (ISR default vs. `page.js`'s intentional
  query-driven dynamic-render). Worth a one-line comment at `[region]/page.js:35`
  if this is understood and intended, since the plan and review discuss the
  redirect's *destination* correctness at length but never its cache lifetime.
- If a region code's canonical casing or spelling is ever changed (the plan's
  risk table already flags "region codes contain characters that need URL
  encoding" as one such future change), a stale `s-maxage=31536000` redirect
  response pointing at the old canonical form would keep being served from
  Vercel's edge for up to a year unless purged. Low likelihood, high blast
  radius (an entire region's play traffic silently redirecting nowhere useful),
  and the fix is operational (purge on deploy) rather than code.

## Finding 3 (checked, not a bug) — hostile/unusual input survey

All tested against the live production build (uncontaminated codes only,
before the case-collision runs above where noted):

| Input | Result | Note |
|---|---|---|
| `?region=A&region=B` (repeated param) | Redirects to `/game/A` | `firstValue()` (`game/page.js:13-16`) takes index 0; matches its own JSDoc and the plan's stated precedence. Not new — confirms existing behavior under real HTTP, not just unit test. |
| `?region=` + 5,000 `A`s | `307` to `/game/AAAA...` (5000 chars), no error | No length cap; harmless here since it 404s downstream. A pathological (~100KB) value could not be tested — hit a *client-side* `curl`/shell argument-length limit (`Argument list too long`), not a server response. Inconclusive on Node's own header-size ceiling (default `--max-http-header-size` 16KB); not confirmed either way. |
| `?region=%C4%91%C3%A0-n%E1%BA%B5ng` (percent-encoded Vietnamese) | `307` to `/game/%C4%90%C3%80-N%E1%BA%B4NG`, then `404` at that path | `.toUpperCase()` handles Vietnamese diacritics correctly (Unicode-aware); round-trips through `encodeURIComponent` cleanly; ends at an honest 404 (matches H1's documented intent). |
| `/game/%2e%2e%2f` and `/game/..%2F..%2Fdebug` (path-segment, not query) | `404`, no `Location` header at all | Confirms the review's H1 analysis extends symmetrically to `[region]/page.js:35` — that redirect only fires *after* `isRegion(code)` passes, so a decoded `../` never reaches a redirect target from this side either. |
| `/game/HN%00` (null byte) | `404` | No crash. |
| `/game/DL/` (trailing slash) | `308 Permanent Redirect` to `/game/DL` | Next's built-in `trailingSlash: false` default normalization, not app code — unrelated to this feature, noted for completeness since it's one more hop a bookmarked URL with a trailing slash would take. |
| Region differing by more than casing (e.g. attempted `/game/Hn`) | Same case-collision class as Finding 1 once any casing of that code has been touched | Not a distinct bug — same mechanism. |

## Finding 4 (reviewed, not reproducible) — round state machine / prefetch epoch

Read `src/app/components/GameClient.js` in full (561 lines) against the
scenario in the task: whether the prop-based `region` (vs. the removed
`location` state) can desync from what's on screen.

- `startPrefetch` (`:246-258`) and `handleNextRound` (`:308-339`) both close
  over `region` as a prop, not a ref or state snapshot — so if this component
  ever re-rendered with a new `region` value without unmounting, a prefetch
  started under the old region could resolve after the prop changed and
  `applyRound` would apply data fetched for the *old* region under the *new*
  region's header/name. This is exactly what the prior review's M2 flagged.
- Confirmed the fix from the review is applied: `[region]/page.js:43` renders
  `<GameClient key={code} region={code} />`. A `region` prop change now forces
  a full remount (fresh `useState` initializers, fresh refs), which is React's
  documented behavior for a changed `key` — I traced this against React's own
  reconciliation contract, not just trusting the comment. This closes the
  class of bug outright rather than patching around it; I found no remaining
  path (including the epoch/watchdog/prefetch machinery, which is otherwise
  unchanged from `main` per the prior review's concurrency check) where the
  displayed region and the prop can now diverge, because there is no longer
  any way to reach a re-render of this component with a different `region`
  without first tearing down all of its refs and closures.
- I looked specifically for a route-level path that could hit this component
  twice with different `region` values without a full page navigation
  (e.g. via `router.refresh()`, a parallel route, or an intercepted route) —
  none exist in `src/app/game/`. Nothing to report beyond the review's own
  finding, which is fixed.

## Finding 5 (checked, matches docs) — `redirect()` status and streaming

Confirmed from `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:12`
("serves a `307` HTTP redirect response") and `:204-217` (FAQ: `redirect()`
defaults to 307, not 302, to preserve method) — matches the plan's
implementation note that D5 became moot. Confirmed empirically for the one
redirect path immune to Finding 1's contamination (`/game?region=` on the
fully dynamic `/game` route): real `307`, real `Location` header, every time,
`no-store`. The doc's caveat about a "streaming context" inserting a
client-side meta-tag redirect instead of a real HTTP redirect does not apply
here — I checked for a `loading.js` anywhere under `src/app/` (`find` returned
none) and the root layout (`src/app/layout.js`) has no `Suspense` boundary
above `children`, so both `game/page.js` and `game/[region]/page.js` render
synchronously with nothing streamed ahead of the `redirect()`/`notFound()`
throw — confirmed by the real `Location` header actually being present on the
clean (uncontaminated) legacy-redirect path.

## Not investigated / out of scope reminders

- Did not re-verify `region-request.js`'s coverage-message path (already a
  documented, accepted gap in the plan's "Post-review additions").
- Did not attempt to reproduce Finding 1 on Linux; no such environment was
  available in this session. Flagged as the key open question below.

## Unresolved questions

1. Can someone confirm Finding 1 does **not** reproduce against an actual
   Vercel preview deployment (hit `/game/hn` there, then immediately check
   `/game/HN`)? My reasoning that Vercel's Linux + own cache-key store avoids
   it is inference from documented platform behavior, not a direct test — I
   could not stand up a Linux/Vercel environment from here.
2. Is it worth reporting the "cached `redirect()` throw loses its `Location`
   header" behavior to Next.js as a framework issue? It reproduces reliably
   whenever an ISR-backed dynamic-param page's *first* generated response is a
   `redirect()` — the OS-level case collision is just this codebase's way of
   triggering that path, not the underlying defect. I did not attempt to
   reproduce it without the case-collision trigger (e.g., by finding another
   way to force an ISR page's on-demand generation to redirect) since that was
   outside this task's scope.

Status: DONE_WITH_CONCERNS
Summary: Confirmed dynamicParams/redirect status behavior matches bundled docs and the plan; found and reproduced a serious but environment-specific defect where this Windows machine's case-insensitive filesystem lets `next start`'s ISR cache serve a lowercase legacy region URL's content at 200 with no redirect on first hit, then permanently corrupts the canonical uppercase URL into a headerless, non-functional 307 — proven with clean before/after evidence on an untouched region code, but the mechanism (NTFS case folding) should not reproduce on Vercel's Linux runtime, so this is flagged as a local-verification hazard rather than a confirmed production bug.
Concerns: the Vercel-safety conclusion is inference, not a direct Linux test (open question 1); recommend someone hit `/game/hn` then `/game/HN` on a real preview deploy before fully dismissing production risk.
