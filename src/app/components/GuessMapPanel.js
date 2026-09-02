"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Maximize2, Minimize2 } from 'lucide-react';
import MapSearchBox from './MapSearchBox';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div role="status" aria-live="polite" className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">Loading map...</div>
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
  const collapseButtonRef = useRef(null);

  const handleMapReady = useCallback((map) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);

  // Expanded, the minimap covers the phone screen like a modal, so it owes
  // the player the same escape route one gives: Escape collapses it, and focus
  // moves to the collapse button rather than staying on a cover button that no
  // longer exists.
  useEffect(() => {
    if (!expanded) return undefined;
    collapseButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      // A dialog on top owns Escape; collapsing the map behind it would make
      // one keypress do two things.
      if (document.querySelector('[role="dialog"]')) return;
      onExpandedChange(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded, onExpandedChange]);

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
      // Offsets derive from --action-bar-h: the bar no longer grows with the
      // home indicator (the global footer strip below the game owns that
      // inset), so one token keeps the collapsed and expanded panels aligned
      // to the same edge.
      // From lg up the panel is the first track of the parent grid, so the
      // stretched row -- not a flex-grow on this element -- decides its
      // height; lg:min-h-0 is what lets it shrink under the action bar.
      // `isolate` at every breakpoint, not just where the panel happens to be
      // absolute: it is what keeps Leaflet's own 200-1000 ladder inside the
      // panel, so the chrome below can sit on the app-wide scale instead of
      // out-bidding a third-party stylesheet.
      className={`absolute isolate z-(--z-floating) overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg transition-all duration-200 ease-out bottom-[calc(var(--action-bar-h)+0.75rem)] lg:relative lg:inset-auto lg:h-auto lg:w-auto lg:min-h-0 lg:p-1.5 ${
        expanded ? 'inset-x-3 top-3' : 'right-3 h-[min(9rem,30vh)] w-[min(9rem,30vh)]'
      }`}
    >
      {/* Leaflet's own chrome is sized for a full map, and the phone states
          are not one, so each gets what fits.
          Collapsed: a 144px thumbnail behind an opaque "Tap to guess" cover.
          The tile credit wraps to five lines across it and the zoom buttons
          land on the cover's label -- both unreadable, and the cover eats
          every click anyway. Hidden here, shown on the expanded map one tap
          away; the permanent credit also lives on /credits.
          Expanded: the map is only ~340px wide, so the credit wraps to two
          lines and covers the bottom-left zoom control. Lift the control clear
          rather than dropping either one -- pinch is not the only way to zoom
          a guess.
          Both scoped to max-lg: neither state exists from lg up. */}
      <div
        className={`isolate h-full w-full ${
          expanded
            ? 'max-lg:[&_.leaflet-bottom.leaflet-left]:mb-9'
            : 'max-lg:[&_.leaflet-control-attribution]:hidden max-lg:[&_.leaflet-control-zoom]:hidden'
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
      </div>

      {/* Search rides above the map (same layer as the expand/collapse
          buttons). On phones it only makes sense once the minimap is
          expanded; right-16 keeps an 8px gap to the collapse button there. */}
      <div
        className={`absolute top-2 left-2 z-(--z-pane-chrome) right-16 lg:right-auto lg:top-3 lg:left-3 lg:w-72 ${
          expanded ? '' : 'hidden lg:block'
        }`}
      >
        <MapSearchBox map={mapInstance} rootCode={regionCode} expanded={expanded} />
      </div>

      {/* Desktop counterpart of the phone cover's "Tap to guess": until a pin
          exists, nothing on a bare map says it is clickable. Non-interactive
          so it never steals the click it is inviting.
          bottom-8 clears the attribution bar Leaflet paints along the bottom
          edge: at bottom-3 this badge's opaque background covered the tile
          credit, which has to stay legible. */}
      {!hasGuess && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-(--z-pane-chrome) hidden justify-center lg:flex">
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
          className="absolute inset-0 z-(--z-pane-chrome) flex flex-col items-center justify-center gap-1 bg-background/35 text-xs font-semibold text-foreground backdrop-blur-[1px] lg:hidden"
        >
          <Maximize2 className="size-4" aria-hidden="true" />
          {hasGuess ? 'Edit guess' : 'Tap to guess'}
        </button>
      )}

      {expanded && (
        <button
          type="button"
          ref={collapseButtonRef}
          onClick={() => onExpandedChange(false)}
          aria-label="Collapse the guess map"
          className="absolute top-2 right-2 z-(--z-pane-chrome) flex size-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md backdrop-blur lg:hidden"
        >
          <Minimize2 className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
