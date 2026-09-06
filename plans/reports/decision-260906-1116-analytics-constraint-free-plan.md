# Decision: analytics on the Vercel free plan

Date: 2026-09-06
Status: accepted
Evidence: [research-260906-1110-vercel-analytics-free-limits.md](./research-260906-1110-vercel-analytics-free-limits.md)
Supersedes: `plans/260906-1057-game-analytics-events/` (shelved — see below)

## Constraint

This project is hosted on the **Vercel Hobby (free) plan**. Hobby does not
include custom events. `track()` from `@vercel/analytics` is gated behind a
`Permissions Required: Custom Events` check and the pricing table lists Custom
Events as not included for Hobby.

Consequence: **no `track()` call can work on this deployment.** Any custom-event
instrumentation would be dead code until the account upgrades.

## Second constraint, independent of plan

The Web Analytics **Pages dimension strips query parameters** on every plan
("the page url (without query parameters)"). `Route` resolves to the framework
route, which for the game page is the static `/game`.

Consequence: `/game?region=TPHCM` is indistinguishable from `/game?region=HN`
in analytics — on Hobby, on Pro, on Enterprise. Region popularity is
unobtainable through query strings at any price.

## What we get on Hobby

50,000 events/month (shared across all projects on the account), 1-month
reporting window, no ability to purchase overage — at the cap, a 3-day grace
period then collection stops for 7 days. Dimensions: Pages, Route, Hostname,
Referrers, Country, Browser, Device, OS. Plus Speed Insights Web Vitals.

## Options considered

| Option | Verdict |
|---|---|
| Vercel Pro ($20/mo) | **Rejected.** Costs money *and* caps custom events at 2 properties — 7 of the 12 planned events carry 3+, so the vocabulary needs redesign even after paying |
| Second vendor (PostHog free: 1M events/mo, no property cap) | **Deferred.** Viable and free at this scale, but adds a second script and a second privacy surface. Revisit if per-round metrics are wanted |
| Self-roll into existing Upstash Redis | **Rejected for now.** No dashboard — someone must build the reporting surface. Also puts round data on the server path |
| **Region as a path segment** | **Accepted.** See below |

## Decision

Migrate `/game?region=X` to `/game/X`. The free Pages dimension then reports one
row per region, ranked by traffic — region popularity on the Hobby plan with no
custom events, no new vendor, and no cost.

**Why this is worth doing on its own merits:** a region-scoped game screen having
its own URL is better routing regardless of analytics. It is shareable,
bookmarkable, and honest about what the page shows. The analytics benefit is a
consequence of correct routing, not a hack layered on top.

**What it does not give us,** and we accept losing for now: score distribution,
skip rate, panorama failure rate, rounds-per-visit. These need custom events
(paid Vercel) or a second vendor (PostHog). Revisit before ads ship — see
`monetization-and-licensing` context.

## Impact on existing work

`plans/260906-1057-game-analytics-events/` is **shelved, not deleted.** Its
event vocabulary, privacy allowlist design (D4) and banding rationale (D3) stay
valid and are the starting point if we later adopt PostHog or upgrade. Two parts
are now known-wrong and must not be carried forward as written:

- The `beforeSend` query-stripping is pointless — Vercel already strips query
  params from the Pages dimension. The `/debug/*` exclusion is still worth
  keeping.
- All 12 `track()` call sites are no-ops on this deployment.

## Unresolved questions

1. Current monthly pageview volume is unknown. Determines how close the 50K
   Hobby ceiling is to binding — worth checking in the Vercel dashboard before
   assuming headroom.
2. Whether to add PostHog for per-round metrics, and when. Gated on whether the
   ads decision actually needs score/skip/failure data or just region
   popularity and traffic.
