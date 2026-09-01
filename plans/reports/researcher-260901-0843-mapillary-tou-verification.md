# Mapillary ToU Compliance — Donation vs Ad-Supported GeoGuessr Clone

Source of record: https://www.mapillary.com/terms (current, effective 2024-02-15; `/commercialterms` resolves to the same document — no separate commercial license exists post-Meta-acquisition).

## 1. Verbatim clauses

**Section 11 (Developer attribution)**
> "If you are downloading individual images and serving them from your own servers, you must attribute the image(s) by visibly displaying the Mapillary logo and linking back to the Mapillary homepage or corresponding Mapillary image page."
> "If you integrate data that Mapillary extracts from street-level images using the Mapillary API or our vector tiles in your application, you must attribute the source of the data by visibly displaying the Mapillary logo and linking back to the Mapillary homepage."

**Section 12 (Commercial use)**
> "You may use the Mapillary Services only for the following commercial purposes: (i) improvement, training, and development of products, services, maps, studies, platforms, websites, applications, software, algorithms, datasets, solutions, or technologies; and (ii) in the provision of services for or on behalf of one or more of your clients."
> "You will implement and maintain (i) technical safeguards and business processes that prohibit reidentification or unblurring of any Content, including any individual or license plate; and (ii) business processes to prevent inadvertent disclosure or release of any Content, and notify vendor-incident@meta.com of any incident, infraction, or other activity ... that may be considered an unauthorized or unlawful processing of Content or User Content."

Content license default: **CC BY-SA 4.0** for User Content (images/videos/location data), unless otherwise indicated.

## 2. Is donation-only "commercial"?

Ambiguous label, doesn't matter in practice: Section 12(i) permits use for "development ... of ... applications" full stop — it does not gate on the app's revenue model. Building/operating a game app is covered whether or not it earns money. Donations aren't a sale of Mapillary's imagery/data, so even under a strict reading this isn't the kind of "commercial" resale Mapillary restricts elsewhere (no separate non-commercial tier exists post-2020 — Mapillary made the API free for both commercial and non-commercial use industry-wide per Wikipedia/community-forum sourcing). **Permitted.**

## 3. Does ad-supported fit Section 12?

Yes, same clause (i) applies — nothing in Section 12 conditions the permitted purposes on *how* the resulting app monetizes (ads, donations, subscription are all just business models layered on top of a permitted "application"). No clause in ToU mentions or restricts advertising.

**Strongest evidence of fit: precedent.** Mapillary's own account publicly promoted its GeoGuessr integration: "Mapillary imagery is now integrated into @geoguessr — the online game that lets you explore the world by guessing the location of street-level imagery." (https://x.com/mapillary/status/1167348822361726976). GeoGuessr itself runs a freemium model with ads/sponsor placements in its free tier per its own ToS. Mapillary also shared a fan-made "Geoguess Lite" app link in its community forum (https://forum.mapillary.com/t/geoguessr-in-mapillary/10355), implying tacit approval of GeoGuessr-style third-party apps generally.

**Where it could strain, not clearly violate:**
- Section 12(ii) ("services for/on behalf of clients") does not apply to VNGeoGuessr's model — irrelevant, rely on (i) only.
- Reselling the *offline pano-id/coordinate index itself* as a standalone dataset product would push past "development of an application" into raw data resale — not what's planned (index stays internal/server-side to power gameplay), but worth flagging as the line not to cross.
- No explicit ToU carve-out or prohibition for ads was found anywhere in ToU, help center, or forum — this is an inference from clause (i)'s breadth + the GeoGuessr precedent, not an explicit "ads are OK" statement from Mapillary.

## 4. Obligations (apply under both models identically)

- **Attribution**: Mapillary logo + link back to mapillary.com (or the specific image page) visibly displayed wherever imagery/derived data appears — required per Section 11 regardless of monetization model. A donate button or ad banner doesn't change this; check current gameplay UI actually renders the logo+link (not verified in this research pass — code not inspected per read-only scope).
- **CC BY-SA 4.0 share-alike**: Under standard CC BY-SA 4.0 mechanics, share-alike (§3(a)(4) of the CC BY-SA 4.0 legal code) triggers when you **Adapt and publicly share an adaptation** of the licensed material. Simply *displaying* unmodified panoramas to players (a "public performance/communication") requires **attribution**, not share-alike licensing of your own game code. Share-alike would only bite if VNGeoGuessr redistributes a **modified/derived dataset** built from the imagery (e.g., publishing the offline pano-id/coordinate index externally) — keeping that index server-side/internal to power gameplay (as currently designed) avoids triggering redistribution obligations. This is a general CC BY-SA interpretation, not a Mapillary-specific statement — flagged as unresolved below.
- **Face/license-plate safeguards**: Mapillary auto-blurs faces/plates on ingestion; Section 12 additionally obligates commercial users to maintain "technical safeguards and business processes that prohibit reidentification or unblurring." Practical implication: don't add zoom/enhance features designed to defeat blur, don't let users flag imagery for "unblurring," and have a path to notify vendor-incident@meta.com if an incident occurs.
- **Rate limits**: Confirmed by Mapillary staff ("Yaro") on the community forum (https://forum.mapillary.com/t/50-000-requests-day-rate-limit-scope/10644): the 50k/day vector-tile cap is scoped **per application (app/client ID)**, with possible additional IP-level throttling during traffic spikes; entity API calls are capped separately (60k/min) and search API at 10k/min per app. If ad-driven growth increases traffic, contact support@mapillary.com to request a higher quota — this is the documented escalation path, not a rate-limit violation risk by default.

## 5. Official statements on GeoGuessr-style / ad-supported apps

- No formal ToU clause or help-center article names "GeoGuessr" or addresses ad-supported apps specifically.
- Mapillary's own Twitter/X account publicly endorsed the original Mapillary-GeoGuessr integration (2019): https://x.com/mapillary/status/1167348822361726976
- Mapillary community forum thread confirms Mapillary staff shared a GeoGuessr-alternative ("Geoguess Lite") approvingly: https://forum.mapillary.com/t/geoguessr-in-mapillary/10355 — no explicit compliance guidance given, just informal endorsement.
- No forum/help-center hits found addressing ads/monetization directly for third-party apps built on Mapillary data.

## Bottom line

Both models are consistent with Section 12(i)'s broad "development ... of ... applications" permission and align with Mapillary's own public precedent (GeoGuessr integration, community-shared clone). No ToU clause singles out or bars advertising revenue. Compliance risk is concentrated in **execution**, not eligibility: visible logo+link attribution, no unblur/reidentify features, keeping the derived pano index internal rather than republishing it, and staying inside (or negotiating past) the 50k/day vector-tile cap as usage scales with ads.

## Unresolved questions

1. No Mapillary source explicitly confirms ad-supported/rewarded-ads monetization is acceptable — conclusion rests on clause breadth + GeoGuessr precedent, not a direct statement. Consider emailing support@mapillary.com or vendor-incident@meta.com for a written confirmation before launching ads, given no explicit ToU carve-out exists either way.
2. CC BY-SA share-alike scoping (display vs. adaptation) is a general CC-license interpretation applied to Mapillary's case, not a Mapillary-specific legal opinion — worth counsel review if the offline index is ever exposed/exported outside the app.
3. Whether the current gameplay UI actually renders the required Mapillary logo + link was not verified (out of scope — read-only research, no code inspection performed for this task).
4. `/commercialterms` legacy page content was inferred to be identical to `/terms` Section 12 via WebFetch summary, not a byte-for-byte diff — low risk given both are Meta/Mapillary-owned canonical pages, but not independently confirmed word-for-word.

Status: DONE_WITH_CONCERNS
Summary: Both donation-only and ad-supported models fit Section 12(i)'s broad "development of applications" permission and match Mapillary's own GeoGuessr-integration precedent; no ToU clause bars ads, but no source explicitly blesses ad monetization either, so treat as reasoned inference, not a guarantee — recommend a direct written confirmation from Mapillary before shipping ads.
Concerns/Blockers: No explicit Mapillary statement on ad-supported apps found; recommend written confirmation from support@mapillary.com before monetization launch. CC BY-SA share-alike scoping for the internal pano index is a general-license interpretation, not Mapillary-specific guidance — flag for legal review if that index is ever exported/published.
