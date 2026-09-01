"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Maximize2, Minimize2 } from 'lucide-react';
import MapSearchBox from './MapSearchBox';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div role="status" aria-live="polite" className="w-full h-full min-h-[400px] bg-muted flex items-center justify-center text-muted-foreground">Loading map...</div>
});

// The guess map with its phone minimap behavior. `expanded` stays controlled
// by GameClient because a round reset has to collapse the map again.
export default function GuessMapPanel({
  center,
  bbox,
  regionCode,
  expanded,
  onExpandedChange,
  hasGuess,
  onMapClick,
}) {
  const mapRef = useRef(null);
  // Mirrored into state so the search box renders once the map exists.
  const [mapInstance, setMapInstance] = useState(null);

  const handleMapReady = useCallback((map) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);

  // Leaflet caches its container size, so growing or shrinking the minimap
  // leaves it rendering at the old dimensions until it is told to remeasure.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = setTimeout(() => map.invalidateSize(), 220);
    return () => clearTimeout(timer);
  }, [expanded]);

  return (
    <div
      // Frame the map rather than restyling its tiles: a bright map inset
      // in a padded card with real elevation reads as a lit window on
      // dark chrome, which is how GeoGuessr handles the same problem.
      className={`absolute z-[500] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg transition-all duration-200 ease-out bottom-[calc(5.25rem+env(safe-area-inset-bottom))] lg:relative lg:inset-auto lg:z-auto lg:h-auto lg:w-auto lg:flex-1 lg:min-h-0 lg:p-1.5 ${
        expanded ? 'inset-x-3 top-3' : 'right-3 h-36 w-36'
      }`}
    >
      <LeafletMap
        center={center}
        bbox={bbox}
        zoom={10}
        // The search box owns the top-left corner on every breakpoint.
        zoomPosition="bottomleft"
        onMapClick={onMapClick}
        onReady={handleMapReady}
        className="w-full h-full"
      />

      {/* Search rides above the map (same layer as the expand/collapse
          buttons). On phones it only makes sense once the minimap is
          expanded; right-14 keeps it clear of the collapse button there. */}
      <div
        className={`absolute top-2 left-2 z-[1200] right-14 lg:right-auto lg:top-3 lg:left-3 lg:w-72 ${
          expanded ? '' : 'hidden lg:block'
        }`}
      >
        <MapSearchBox map={mapInstance} rootCode={regionCode} expanded={expanded} />
      </div>

      {/* Desktop counterpart of the phone cover's "Tap to guess": until a pin
          exists, nothing on a bare map says it is clickable. Non-interactive
          so it never steals the click it is inviting. */}
      {!hasGuess && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1100] hidden justify-center lg:flex">
          <span className="rounded-lg bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur">
            Click to place your guess
          </span>
        </div>
      )}

      {/* Collapsed, the map is only a preview: this cover turns the whole
          minimap into one tap target instead of letting a stray touch
          drop a pin the player cannot see at that size. */}
      {!expanded && (
        <button
          type="button"
          onClick={() => onExpandedChange(true)}
          aria-label="Expand the guess map"
          className="absolute inset-0 z-[1200] flex flex-col items-center justify-center gap-1 bg-background/35 text-xs font-semibold text-foreground backdrop-blur-[1px] lg:hidden"
        >
          <Maximize2 className="size-4" aria-hidden="true" />
          {hasGuess ? 'Edit guess' : 'Tap to guess'}
        </button>
      )}

      {expanded && (
        <button
          type="button"
          onClick={() => onExpandedChange(false)}
          aria-label="Collapse the guess map"
          className="absolute top-2 right-2 z-[1200] flex size-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md backdrop-blur lg:hidden"
        >
          <Minimize2 className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
