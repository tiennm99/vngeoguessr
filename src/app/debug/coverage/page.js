"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PanoramaViewer from '../../components/PanoramaViewer';
import RegionSelect from '../../components/RegionSelect';
import { getRegion } from '../../../lib/regions';

const CoverageMap = dynamic(() => import('./CoverageMap'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground"
    >
      Loading map...
    </div>
  ),
});

export default function CoveragePage() {
  // Province and district only: the country has no outline of its own, so the
  // route has nothing to draw for it.
  const [level, setLevel] = useState('province');
  const [region, setRegion] = useState('TPHCM');
  // The outline is held apart from the dots and replaced only when the region
  // changes. Storing it with each response gave it a new identity on every
  // pan, and the map treated that as a new region and refit itself, so no zoom
  // ever survived and each refit triggered another fetch.
  const [boundary, setBoundary] = useState(null);
  const [panos, setPanos] = useState(null);
  const [counts, setCounts] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // The point the user clicked, and the image it resolves to. Thumbnail URLs
  // are signed and short-lived, so the index stores ids only and the picture is
  // fetched when a point is actually opened.
  const [selected, setSelected] = useState(null);
  const [pano, setPano] = useState(null);
  const [panoError, setPanoError] = useState(null);
  const [panoLoading, setPanoLoading] = useState(false);
  const panoRequestRef = useRef(0);

  // Only the newest response may update the view: panning fires requests faster
  // than they come back, and an older one landing last would redraw stale dots.
  const requestIdRef = useRef(0);

  const load = useCallback(async (regionCode, viewport) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ region: regionCode });
      if (viewport) params.set('bbox', viewport.join(','));
      const response = await fetch(`/api/debug/region-coverage?${params}`);
      const json = await response.json();
      if (requestId !== requestIdRef.current) return;

      if (!json.success) {
        // Everything derived from the previous region has to go with the dots.
        // Leaving the tallies up rendered Ho Chi Minh's 184,938 as Cu Chi's,
        // beside the error saying Cu Chi could not be loaded.
        setError(json.error || 'Request failed');
        setPanos(null);
        setCounts(null);
        setGeneratedAt(null);
        return;
      }

      // Present only on the first request for a region.
      if (json.boundary) setBoundary(json.boundary);
      setPanos(json.panos);
      setCounts(json.counts);
      setGeneratedAt(json.generatedAt);
    } catch (fetchError) {
      if (requestId === requestIdRef.current) setError(String(fetchError.message));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setBoundary(null);
    setPanos(null);
    setCounts(null);
    setGeneratedAt(null);
    setSelected(null);
    setPano(null);
    load(region, null);
  }, [region, load]);

  const handleSelectPano = useCallback(async (point) => {
    const requestId = ++panoRequestRef.current;
    setSelected(point);
    setPano(null);
    setPanoError(null);
    setPanoLoading(true);

    try {
      const response = await fetch(`/api/debug/pano?id=${encodeURIComponent(point.id)}`);
      const json = await response.json();
      if (requestId !== panoRequestRef.current) return;
      if (json.success) setPano(json.pano);
      else setPanoError(json.error || 'Lookup failed');
    } catch (fetchError) {
      if (requestId === panoRequestRef.current) setPanoError(String(fetchError.message));
    } finally {
      if (requestId === panoRequestRef.current) setPanoLoading(false);
    }
  }, []);

  const closePano = useCallback(() => {
    // Bump the request id so a lookup still in flight cannot reopen the panel.
    panoRequestRef.current++;
    setSelected(null);
    setPano(null);
    setPanoError(null);
    setPanoLoading(false);
  }, []);

  // The inspector covers part of the map, so Escape closes it -- the X in its
  // header is the only other way out.
  useEffect(() => {
    if (!selected) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      // An open select owns Escape; closing the inspector behind it would make
      // one keypress do two things.
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
      closePano();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, closePano]);

  const handleBoundsChange = useCallback(
    (nextBbox) => {
      load(region, nextBbox);
    },
    [region, load]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Same title pattern as the other debug pages, with the tool's own
          controls beside it. The shared debug layout owns the app chrome. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-2">
        <h1 className="text-xl font-bold text-foreground">
          Panorama coverage
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {getRegion(region).name}
          </span>
        </h1>

        <RegionSelect
          level={level}
          onLevelChange={setLevel}
          region={region}
          onRegionChange={setRegion}
          levels={['province', 'district']}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-4 py-2 text-sm">
        {error && (
          <span role="alert" className="font-medium text-destructive">
            {error}
          </span>
        )}
        {counts && (
          <>
            <Badge variant="secondary" className="tabular-nums">
              {counts.total.toLocaleString()} in region
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              {counts.inView.toLocaleString()} in view
            </Badge>
            <Badge variant="brand" className="tabular-nums">
              {counts.shown.toLocaleString()} drawn
            </Badge>
            {counts.sampled && (
              <span className="text-muted-foreground">
                sampled evenly — zoom in to see every panorama
              </span>
            )}
          </>
        )}
        {generatedAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            snapshot {new Date(generatedAt).toISOString().slice(0, 10)}
          </span>
        )}
        {loading && <span className="text-xs text-muted-foreground">loading…</span>}
      </div>

      {/* The map is the tool, so it gets the whole surface. From lg the
          inspector floats over its right edge: the old two-column grid held
          half the width empty until a point was picked, and reflowing the map
          on selection moved the very dot the user had just clicked. A phone has
          neither the width to float into nor the height to split -- 112px of
          map is not a map -- so there the inspector takes the surface instead
          and its close button brings the map back.
          min-h-64 is the floor that keeps that promise: the page chrome takes
          225px, so on a landscape phone a purely flexed surface collapsed to
          98px. The floor makes <main> scroll instead of shrinking the map
          below the point of being one. */}
      <div className="flex min-h-64 flex-1 flex-col lg:relative lg:block lg:min-h-0">
        {/* Kept mounted while hidden, so coming back costs no reload; the
            map's ResizeObserver re-measures it when it reappears. */}
        <div
          className={`relative min-h-0 flex-1 lg:absolute lg:inset-0 lg:block ${
            selected ? 'hidden' : ''
          }`}
        >
          <CoverageMap
            boundary={boundary}
            panos={panos}
            selectedId={selected?.id}
            onSelectPano={handleSelectPano}
            onBoundsChange={handleBoundsChange}
          />
        </div>

        {selected && (
          <aside
            aria-label={`Panorama ${selected.id}`}
            // Bottom sheet on phones, side panel from lg: covering the map
            // from the edge is what map tools do, and it leaves the clicked
            // dot exactly where it was.
            className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border bg-card lg:absolute lg:inset-y-3 lg:right-3 lg:z-(--z-floating) lg:h-auto lg:w-[26rem] lg:rounded-xl lg:border lg:shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{selected.id}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={`https://www.mapillary.com/app/?pKey=${selected.id}&focus=photo`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Mapillary
                  </a>
                </Button>
                <Button
                  onClick={closePano}
                  variant="ghost"
                  size="icon"
                  aria-label="Close panorama"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 bg-neutral-900">
              {panoError ? (
                <div role="alert" className="flex h-full items-center justify-center p-4 text-center text-sm text-destructive">
                  {panoError}
                </div>
              ) : pano ? (
                <PanoramaViewer key={pano.id} imageUrl={pano.url} />
              ) : (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex h-full items-center justify-center text-sm text-neutral-300"
                >
                  {panoLoading ? 'Loading panorama…' : 'Select a point'}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
