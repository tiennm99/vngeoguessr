"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PanoramaViewer from '../../components/PanoramaViewer';
import { cities } from '../../../lib/game';

const CoverageMap = dynamic(() => import('./CoverageMap'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full w-full items-center justify-center rounded-lg bg-muted text-muted-foreground"
    >
      Loading map...
    </div>
  ),
});

export default function CoveragePage() {
  const [city, setCity] = useState(cities[0]?.code ?? 'TPHCM');
  // The outline is held apart from the dots and replaced only when the city
  // changes. Storing it with each response gave it a new identity on every
  // pan, and the map treated that as a new city and refit itself, so no zoom
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

  const load = useCallback(async (cityCode, viewport) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ city: cityCode });
      if (viewport) params.set('bbox', viewport.join(','));
      const response = await fetch(`/api/debug/city-coverage?${params}`);
      const json = await response.json();
      if (requestId !== requestIdRef.current) return;

      if (!json.success) {
        setError(json.error || 'Request failed');
        setPanos(null);
        return;
      }

      // Present only on the first request for a city.
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
    setSelected(null);
    setPano(null);
    load(city, null);
  }, [city, load]);

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

  const handleBoundsChange = useCallback(
    (nextBbox) => {
      load(city, nextBbox);
    },
    [city, load]
  );

  return (
    <div className="flex h-dvh flex-col vn-gradient-bg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" aria-label="Back to debug tools">
            <Link href="/debug">
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Debug</span>
            </Link>
          </Button>
          <h1 className="text-lg font-bold text-foreground">Panorama coverage</h1>
        </div>

        <div role="group" aria-label="City" className="flex flex-wrap gap-1">
          {cities.map((option) => (
            <Button
              key={option.code}
              onClick={() => setCity(option.code)}
              variant={city === option.code ? 'default' : 'outline'}
              size="sm"
              aria-pressed={city === option.code}
            >
              {option.name}
            </Button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-4 py-2 text-sm">
        {error && (
          <span role="alert" className="font-medium text-destructive">
            {error}
          </span>
        )}
        {counts && (
          <>
            <Badge variant="secondary" className="tabular-nums">
              {counts.total.toLocaleString()} in city
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

      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-2">
        <div className="min-h-[40dvh] lg:min-h-0">
          <CoverageMap
            boundary={boundary}
            panos={panos}
            selectedId={selected?.id}
            onSelectPano={handleSelectPano}
            onBoundsChange={handleBoundsChange}
          />
        </div>

        {selected && (
          <div className="flex min-h-[40dvh] flex-col overflow-hidden rounded-lg border border-border bg-card lg:min-h-0">
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

            <div className="min-h-0 flex-1 bg-neutral-900">
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
          </div>
        )}
      </div>
    </div>
  );
}
