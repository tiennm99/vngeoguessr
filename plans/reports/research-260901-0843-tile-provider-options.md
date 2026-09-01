# Tile provider research — replacing tile.openstreetmap.org

Context: OSM public tile server usage policy prohibits heavy/commercial apps.
Project is donation-only today, ad-supported later (ads = commercial for every
provider's definition). Need: free tier + commercial use permitted + Leaflet.

## Verdict

**Recommended: Geoapify.** Only provider found whose *free* tier explicitly
permits commercial use, serves raster tiles (drop-in Leaflet URL swap), 3,000
credits/day (~good for a hobby game's traffic), requires "Powered by Geoapify"
attribution. Source: geoapify.com/pricing FAQ — "Yes, we do not restrict that.
However, you must provide an appropriate Geoapify attribution or link."

**Runner-up: OpenFreeMap.** Unlimited, no API key, commercial explicitly OK,
attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap". BUT vector
tiles only — requires MapLibre GL (or maplibre-gl-leaflet adapter) instead of
plain Leaflet raster layers; bigger code change, donation-funded sustainability.

## Rejected

| Provider | Free tier | Why rejected |
|---|---|---|
| Stadia Maps | 200k credits/mo | "Commercial use not allowed" on free plan; $20/mo Starter removes it |
| Jawg | 25k views/mo | Free plan non-commercial only; commercial from €250/mo |
| MapTiler | ~100k loads | Free tier aimed at non-commercial/evaluation (not re-verified in depth) |
| Thunderforest | 150k tiles/mo | Hobby-project tier, not verified for ads use |
| tile.openstreetmap.org | unlimited-ish | Current provider; policy bans commercial/heavy use |

## Migration shape (when ready)

3 files hardcode the OSM URL: `src/app/components/LeafletMap.js`,
`src/app/components/ResultMap.js`, `src/app/debug/coverage/CoverageMap.js`.
Swap to Geoapify raster URL
(`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=...`),
key via `NEXT_PUBLIC_GEOAPIFY_KEY`, attribution string gains
"Powered by Geoapify". Extract the tile URL + attribution into one shared
module so the three maps can't drift.

Note: while the game stays donation-only and low-traffic, staying on
tile.openstreetmap.org with attribution is tolerated; the switch becomes
mandatory when ads ship.

## Unresolved questions

- Geoapify credit math: 1 credit ≈ several tile requests? Verify daily budget
  against real traffic before relying on it (3k credits/day may be tight if
  1 tile = 1 credit and players pan a lot).
- MapTiler free-tier commercial wording not re-verified; recheck only if
  Geoapify credits prove insufficient.

Sources: https://www.geoapify.com/pricing/ · https://stadiamaps.com/pricing/ ·
https://openfreemap.org/ · https://www.jawg.io/en/pricing/ ·
https://operations.osmfoundation.org/policies/tiles/
