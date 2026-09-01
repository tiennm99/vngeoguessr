"use client";

import { useEffect, useRef } from 'react';
import { getTileConfig } from '../../lib/map-tiles';

// Leaflet divIcons need literal colours (they render outside the CSS token
// cascade), so these mirror the palette by hand: guess blue stays readable on
// both tile themes, actual green matches --success's hue, the line is
// --vn-red. The dialog's legend imports these so the dots and their names can
// never drift apart.
export const MARKER_COLORS = {
  guess: '#2563eb',
  actual: '#22c55e',
  line: '#da251d',
};

// The reveal map inside the result dialog: the guess pin, the actual location,
// and the line between them. Imperative Leaflet rather than LeafletMap because
// this map is built once per reveal with markers already known, not clicked on.
//
// Owning the container here (instead of a ref handed down from the dialog)
// guarantees it exists by the time the effect runs, which is what lets this
// component have no mount-retry loop.
export default function ResultMap({ guessCoordinates, exactLocation }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!guessCoordinates) return undefined;

    let disposed = false;

    const initializeMap = async () => {
      if (disposed || !containerRef.current) return;

      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');
        if (disposed) return;

        // No default-icon config: every marker on this map uses a divIcon, so
        // the default marker images are never requested.
        const map = L.map(containerRef.current, {
          preferCanvas: true,
          attributionControl: true
        });

        const tiles = getTileConfig();
        L.tileLayer(tiles.url, tiles.options).addTo(map);

        const markers = [];

        // Blue, matching the in-game guess pin, so "your guess" keeps one
        // colour between screens -- and blue/green survives red-green colour
        // blindness where the old red/green pair did not.
        const guessIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: ${MARKER_COLORS.guess}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const guessMarker = L.marker([guessCoordinates[0], guessCoordinates[1]], {
          icon: guessIcon
        }).addTo(map).bindPopup("Your Guess");
        markers.push(guessMarker);

        if (exactLocation) {
          const actualIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: ${MARKER_COLORS.actual}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          const trueLocationMarker = L.marker([exactLocation.lat, exactLocation.lng], {
            icon: actualIcon
          }).addTo(map).bindPopup("Actual Location");
          markers.push(trueLocationMarker);

          L.polyline([
            [exactLocation.lat, exactLocation.lng],
            [guessCoordinates[0], guessCoordinates[1]]
          ], { color: MARKER_COLORS.line, weight: 3, dashArray: '8 4' }).addTo(map);
        }

        if (markers.length > 1) {
          const featureGroup = new L.featureGroup(markers);
          map.fitBounds(featureGroup.getBounds(), { padding: [20, 20], maxZoom: 16 });
        } else {
          map.setView([guessCoordinates[0], guessCoordinates[1]], 13);
        }

        // The dialog is still animating open when the map is built, so remeasure
        // once the transition should have settled (and once more for slow frames).
        setTimeout(() => map.invalidateSize(), 100);
        setTimeout(() => map.invalidateSize(), 500);

        mapRef.current = map;
      } catch (error) {
        console.error('Error creating result map:', error);
      }
    };

    // Same grace period the dialog animation always had before the map went in.
    const timer = setTimeout(initializeMap, 300);

    return () => {
      disposed = true;
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [guessCoordinates, exactLocation]);

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <div
        ref={containerRef}
        className="h-52 w-full bg-muted"
        style={{ minHeight: '208px' }}
      />
      <div className="flex justify-between text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 tabular-nums">
        {exactLocation && (
          <span>Actual: {exactLocation.lat.toFixed(4)}, {exactLocation.lng.toFixed(4)}</span>
        )}
        {guessCoordinates && (
          <span>Guess: {guessCoordinates[0].toFixed(4)}, {guessCoordinates[1].toFixed(4)}</span>
        )}
      </div>
    </div>
  );
}
