// The only place a tile URL may live: every Leaflet map (guess, result,
// debug coverage) renders whichever provider this module picks.
//
// Client-safe: imported by client components, so nothing server-only may be
// imported here (tests/regions.test.js walks the import graph to enforce it).
//
// NEXT_PUBLIC_* is inlined at build time, so the choice is a build-time
// constant: with a Geoapify key the maps use Geoapify (free tier explicitly
// allows commercial use); without one they fall back to the OSM public
// server, which tolerates low-traffic non-commercial use — fine for local
// dev, e2e, and forks, but production must set the key before ads ship.
const geoapifyKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY;

/**
 * Resolve the tile layer for every map in the app.
 *
 * @returns {{url: string, options: {maxZoom: number, attribution: string}}}
 *   Arguments for L.tileLayer(url, options).
 */
export function getTileConfig() {
  if (geoapifyKey) {
    return {
      url: `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`,
      options: {
        maxZoom: 19,
        // Geoapify's free plan requires all three credits for non-osm-carto
        // styles: Geoapify, OpenMapTiles (the tile schema), and OSM (the data).
        attribution:
          'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> | <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> | <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
      },
    };
  }
  return {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      // OSM's attribution guideline asks for a link to the copyright page.
      attribution:
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
    },
  };
}
