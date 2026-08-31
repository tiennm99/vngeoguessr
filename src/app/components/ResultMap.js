"use client";

import { useEffect, useRef } from 'react';

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

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        const markers = [];

        const redIcon = L.divIcon({
          className: 'custom-div-icon',
          html: '<div style="background-color: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const guessMarker = L.marker([guessCoordinates[0], guessCoordinates[1]], {
          icon: redIcon
        }).addTo(map).bindPopup("Your Guess");
        markers.push(guessMarker);

        if (exactLocation) {
          const greenIcon = L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color: #22c55e; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          const trueLocationMarker = L.marker([exactLocation.lat, exactLocation.lng], {
            icon: greenIcon
          }).addTo(map).bindPopup("Actual Location");
          markers.push(trueLocationMarker);

          L.polyline([
            [exactLocation.lat, exactLocation.lng],
            [guessCoordinates[0], guessCoordinates[1]]
          ], { color: '#da251d', weight: 3, dashArray: '8 4' }).addTo(map);
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
