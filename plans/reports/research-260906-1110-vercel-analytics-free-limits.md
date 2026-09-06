# Research Report: Vercel Web Analytics free (Hobby) plan limits

Conducted 2026-09-06. Sources: Vercel docs (last_updated 2026-08-25 / 2026-08-28
/ 2026-06-26), plus one comparison search for alternatives.

## Executive Summary

**Custom events are not available on Hobby.** The plan
`plans/260906-1057-game-analytics-events/` cannot ship as written on the free
tier — `track()` is gated, so all 12 planned events would be no-ops.

**Query strings are not captured on any plan.** The Pages dimension is
documented as "the page url (**without query parameters**)". So `?region=TPHCM`
is invisible today and would stay invisible. This corrects an earlier claim in
this session that `?region=` was "technically visible in the Analytics
filters" — it is not.

Net: on Hobby, Vercel Web Analytics can tell us nothing about which region gets
played. Not a little — nothing.

**Even Pro caps custom-event properties at 2.** Seven of the twelve planned
events carry 3+ properties, so the vocabulary needs redesign even after paying.

## Hobby limits (verified)

| | Hobby | Pro | Pro + Plus ($10/mo) |
|---|---|---|---|
| Included events / month | **50,000** | None (usage-billed) | same |
| Additional events | **cannot purchase** | $0.03 / 1K | $0.03 / 1K |
| Reporting window | **1 month** | 12 months | 24 months |
| **Custom events** | **— (not included)** | Included | Included |
| **Properties per custom event** | **—** | **2** | **8** |
| UTM parameters | — | — | Included |
| Projects | Unlimited | Unlimited | Unlimited |

The custom-events doc page carries a `🔒 Permissions Required: Custom Events`
gate, independently confirming the pricing table's dash.

**Overage behavior on Hobby:** at 50K events, a 3-day grace period starts, then
collection stops. Data collection resumes 7 days later. Events are counted
across *all projects on the account*, not per project.

**Universal custom-data limits** (apply once custom events are available):
- Nested objects unsupported.
- Allowed value types: `string`, `number`, `boolean`, `null`.
- Event name, property key and property value each ≤ 255 characters.
- No documented cap on the number of *distinct* event names.

## What is actually available on Hobby

Dimensions: Pages (query stripped), Route (framework route), Hostname,
Referrers, Country, Browser, Device, OS. CSV export up to 250 rows per panel.

For this app, `Route` resolves to `/game` — a static route with no dynamic
segment — so region popularity is unobtainable.

## Options

### A. Ship the plan on Vercel Pro — $20/mo + usage

Custom events unlock, but **2 properties per event**. The vocabulary must be
cut to fit: e.g. `guess_submitted` drops from `{region, level, points, band}` to
2 of those. A common workaround is folding two dimensions into one string
(`"TPHCM|district"`), which works but makes the dashboard's own breakdown
useless — you get one blob column instead of two filterable ones.

Cost is not just $20: Pro has no included events, so all pageviews become
usage-billed against the monthly credit.

### B. Make region a path segment — free, no new dependency

Change `/game?region=TPHCM` to `/game/TPHCM` (Next.js `app/game/[region]/`).
The free Pages dimension then shows one row per region, ranked — region
popularity solved on the Hobby plan with zero custom events and zero new
vendors.

Gets you: region popularity, plus `/credits`, `/debug` traffic already.
Does not get you: scores, distance bands, skip rate, failures, rounds-per-visit.

Costs: a routing change plus a redirect for existing `?region=` links (the code
already supports a legacy `?location=` param, so the compatibility pattern
exists). Note this is a URL-shape change to a public surface.

### C. A different analytics vendor with a real free tier

| | Free tier | Custom events | Retention |
|---|---|---|---|
| PostHog Cloud | 1M events/mo | Yes | — |
| Umami Cloud | 100K events/mo, 3 sites | Yes | 6 months |
| Umami / Plausible CE self-hosted | free, your infra | Yes | your call |

PostHog's free tier is 20x Vercel Hobby's event allowance and includes custom
events with no 2-property cap. Cost: a second script on the page, a second
vendor's privacy surface, and (for self-hosting) infrastructure this project
does not currently run.

### D. Roll it into the existing Upstash Redis

The project already runs Upstash Redis for sessions and leaderboards, and Neon
Postgres for panoramas. Counter keys per region/event are cheap and the data
stays on infrastructure already in use and already paid for.

Cost: build and maintain a reporting surface. There is no dashboard — someone
has to write the queries and a page to read them. Also puts round data on the
server path, which the plan explicitly listed as a non-goal.

## Recommendation

**B now, C if more is wanted.** Option B answers the single highest-value
question (which regions get played, needed for the ads decision) for free and
with no new vendor. If scores, skip rate and rounds-per-visit are also wanted,
add PostHog rather than paying for Vercel Pro — it is free at this project's
scale, and its 2-property cap does not exist.

Option A is the worst value here: it costs money *and* forces the vocabulary
redesign that the 2-property cap imposes.

## Impact on the existing plan

`plans/260906-1057-game-analytics-events/` needs revision before any
implementation:

- Phase 1's `beforeSend` query-stripping is **pointless** — Vercel already
  strips query params from the Pages dimension. The `/debug/*` exclusion is
  still worth keeping.
- Phases 2-4's twelve `track()` calls are no-ops on Hobby.
- The just-accepted answer to Open Question 2 (`rounds_this_visit` as a property
  on `guess_submitted` rather than milestone events) is now moot on Hobby, and
  on Pro it would consume 1 of only 2 property slots.

## Unresolved questions

1. Which option (A/B/C/D)? Determines whether the existing plan is revised,
   replaced, or shelved.
2. If B: is changing the public URL shape `/game?region=X` → `/game/X`
   acceptable? Existing shared links would need a redirect.
3. If C: is a second analytics vendor acceptable given the project's stated
   privacy posture (no coordinates, no pano ids, no usernames)?
4. Current monthly pageview volume — unknown here, and it determines whether
   the 50K Hobby ceiling is even close to binding today.

## Sources

- [Pricing for Web Analytics](https://vercel.com/docs/analytics/limits-and-pricing)
- [Tracking custom events](https://vercel.com/docs/analytics/custom-events)
- [Using Web Analytics](https://vercel.com/docs/analytics/using-web-analytics)
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)
- [PostHog free tier 2026](https://agentdeals.dev/vendor/posthog)
- [Umami free tier](https://freetier.co/directory/products/umami)
- [Open source analytics comparison](https://posthog.com/blog/best-open-source-analytics-tools)
