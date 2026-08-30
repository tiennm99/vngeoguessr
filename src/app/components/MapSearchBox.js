"use client";

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { searchRegions, searchPhoton } from '../../lib/geo-search';
import { getRegion, COUNTRY_CODE } from '../../lib/regions';

// How a chosen result frames the map: an area fits its box, a point gets a
// street-legible zoom.
const POINT_ZOOM = 16;

// Search over the guess map. Region matches come from the local tree and
// render instantly; street/place matches come from Photon after a debounce.
// Selecting a result only pans/zooms -- the guess pin is placed by clicking
// the map, never from here.
export default function MapSearchBox({ map, rootCode, expanded }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // [] = nothing (yet); null = geocoder unreachable, show the unavailable row.
  const [places, setPlaces] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  // Selecting a result echoes its label into the input; that echo must not
  // trigger another geocoder round-trip for a place already chosen.
  const lastSelectedRef = useRef(null);
  const listId = useId();

  // Results outside the played region are noise: bound the geocoder to the
  // region's box, falling back to the whole country.
  const searchBbox = useMemo(() => {
    const region = getRegion(rootCode);
    return region.bbox ?? getRegion(COUNTRY_CODE).bbox;
  }, [rootCode]);

  const regions = useMemo(() => searchRegions(query, rootCode), [query, rootCode]);

  // A round reset collapses the mobile minimap; a stale query from the last
  // round should not survive into the next one.
  useEffect(() => {
    if (!expanded) {
      setQuery('');
      setOpen(false);
      setActiveIndex(-1);
    }
  }, [expanded]);

  useEffect(() => {
    const trimmed = query.trim();
    // A fresh query invalidates whatever the previous one produced -- results
    // and the unavailable row alike must never describe a stale request.
    setPlaces([]);
    if (trimmed.length < 3 || trimmed === lastSelectedRef.current) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setPlaces(await searchPhoton(trimmed, searchBbox, 5, controller.signal));
      } catch {
        // Aborted: a newer query superseded this one.
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchBbox]);

  const results = useMemo(
    () => [...regions, ...(places ?? [])],
    [regions, places]
  );
  const unavailable = places === null && query.trim().length >= 3;
  const showList = open && (results.length > 0 || unavailable);

  const selectResult = (result) => {
    if (result.bbox) {
      const [west, south, east, north] = result.bbox;
      map.fitBounds([[south, west], [north, east]], { padding: [20, 20] });
    } else if (result.center) {
      map.flyTo(result.center, POINT_ZOOM);
    }
    lastSelectedRef.current = result.label;
    setQuery(result.label);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!showList || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectResult(results[activeIndex] ?? results[0]);
    }
  };

  if (!map) return null;

  return (
    <div
      // Interacting with the search must never fall through to the map click
      // handler underneath, which would drop a guess pin.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className="w-full"
    >
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 z-10 size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          aria-label="Search for a district, street, or place"
          placeholder="Search district, street..."
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          // h-11: same touch-target floor as every other control on the
          // expanded mobile map; opaque enough to read over map tiles.
          className="h-11 bg-card/95 pl-8 shadow-md backdrop-blur dark:bg-card/95"
        />
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          // Viewport-relative cap: the panel clips overflow, so on a short
          // screen a fixed-height list would lose its bottom entries with no
          // way to scroll them into view.
          className="mt-1 max-h-[min(14rem,40vh)] overflow-y-auto rounded-md border border-border bg-card/95 py-1 shadow-lg backdrop-blur"
        >
          {results.map((result, index) => (
            <li
              key={`${result.kind}-${result.label}-${index}`}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                // Fires before the input's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectResult(result);
                }}
                className={`flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${
                  index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'
                }`}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{result.label}</span>
                  {result.sublabel && (
                    <span className="block truncate text-xs text-muted-foreground">{result.sublabel}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {unavailable && (
            <li className="px-2.5 py-1.5 text-xs text-muted-foreground" role="status">
              Online search unavailable — district search still works
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
