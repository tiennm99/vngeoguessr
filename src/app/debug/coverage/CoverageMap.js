"use client";

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Panorama dots are drawn on a canvas layer, not as DOM markers. Twelve
// thousand DOM elements would stall the browser; a canvas renderer draws the
// same points in one pass.
const DOT_RADIUS = 2.5;
// Panning fires moveend continuously. Waiting for the map to settle turns a
// drag into one request instead of a dozen.
const MOVE_DEBOUNCE_MS = 250;
// How near a click has to land to count as picking a panorama. Selection is
// resolved against the point list rather than through per-marker click
// handlers: canvas hit-testing did not fire for these markers, and requiring a
// pixel-perfect hit on a 2.5px dot would be miserable to use anyway.
const CLICK_TOLERANCE_PX = 14;

export default function CoverageMap({
  boundary,
  panos,
  selectedId,
  onSelectPano,
  onBoundsChange,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const rendererRef = useRef(null);
  const boundaryLayerRef = useRef(null);
  const dotsLayerRef = useRef(null);
  const highlightRef = useRef(null);
  const panosRef = useRef(panos);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onSelectPanoRef = useRef(onSelectPano);

  panosRef.current = panos;
  onBoundsChangeRef.current = onBoundsChange;
  onSelectPanoRef.current = onSelectPano;

  // Create the map once. Data arrives through the effects below.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { preferCanvas: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    map.setView([16.0, 107.0], 6);

    // One renderer for the life of the map. Creating it per data refresh leaked
    // a canvas each time, because removing the markers leaves their renderer
    // attached to the map.
    rendererRef.current = L.canvas({ padding: 0.2 }).addTo(map);

    let moveTimer = null;
    const report = () => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        const b = map.getBounds();
        onBoundsChangeRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      }, MOVE_DEBOUNCE_MS);
    };
    map.on('moveend', report);

    const pick = (event) => {
      const points = panosRef.current;
      if (!points?.length || !onSelectPanoRef.current) return;

      // Compare in screen space so the tolerance means the same thing at every
      // zoom level.
      const clicked = event.containerPoint;
      let best = null;
      let bestDistance = Infinity;
      for (const point of points) {
        const at = map.latLngToContainerPoint([point.lat, point.lng]);
        const distance = clicked.distanceTo(at);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = point;
        }
      }
      if (best && bestDistance <= CLICK_TOLERANCE_PX) onSelectPanoRef.current(best);
    };
    map.on('click', pick);

    mapRef.current = map;

    return () => {
      clearTimeout(moveTimer);
      map.off('moveend', report);
      map.off('click', pick);
      map.remove();
      mapRef.current = null;
      rendererRef.current = null;
      highlightRef.current = null;
    };
  }, []);

  // Draw the city outline and frame it whenever the city changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundary) return;

    boundaryLayerRef.current?.remove();
    const layer = L.geoJSON(boundary, {
      style: {
        color: '#da251d',
        weight: 2,
        fillOpacity: 0.04,
        dashArray: '6 4',
        // The outline must not swallow clicks meant for the points beneath it.
        interactive: false,
      },
    }).addTo(map);
    boundaryLayerRef.current = layer;

    map.fitBounds(layer.getBounds(), { padding: [24, 24] });
  }, [boundary]);

  // Replace the dots wholesale: the point set changes completely as the
  // viewport moves, so there is nothing worth diffing.
  useEffect(() => {
    const map = mapRef.current;
    const renderer = rendererRef.current;
    if (!map || !renderer) return;

    dotsLayerRef.current?.remove();
    if (!panos?.length) {
      dotsLayerRef.current = null;
      return;
    }

    dotsLayerRef.current = L.layerGroup(
      panos.map((p) =>
        L.circleMarker([p.lat, p.lng], {
          renderer,
          radius: DOT_RADIUS,
          stroke: false,
          fillColor: '#2563eb',
          fillOpacity: 0.65,
          interactive: false,
        })
      )
    ).addTo(map);
  }, [panos]);

  // The selected point gets its own marker rather than a restyled dot: the dots
  // are replaced on every viewport change, and a highlight tied to one of them
  // would vanish the moment the map moved.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    highlightRef.current?.remove();
    highlightRef.current = null;

    const selected = panos?.find((p) => p.id === selectedId);
    if (!selected) return;

    highlightRef.current = L.circleMarker([selected.lat, selected.lng], {
      radius: 9,
      weight: 3,
      color: '#da251d',
      fillColor: '#da251d',
      fillOpacity: 0.25,
      interactive: false,
    }).addTo(map);
  }, [selectedId, panos]);

  return <div ref={containerRef} className="h-full w-full rounded-lg bg-muted" />;
}
