"use client";

import { useEffect, useEffectEvent, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Bundled from the leaflet package rather than fetched from a CDN: a blocked
// or slow CDN would make the guess pin invisible while clicks still register.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { getTileConfig } from '../../lib/map-tiles';

// A static image import is a {src} object under webpack but a bare URL string
// under Turbopack dev; Leaflet needs the string either way.
const imageUrl = (image) => (typeof image === 'string' ? image : image.src);

/**
 * Frame the map on a bbox when there is one, else on a centre and zoom.
 * @param {L.Map} map
 * @param {number[]|null} bbox [west, south, east, north].
 * @param {number[]} center [lat, lng].
 * @param {number} zoom
 * @returns {void}
 */
function frameView(map, bbox, center, zoom) {
  if (bbox) {
    map.fitBounds(L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]]), { padding: [20, 20] });
  } else {
    map.setView(center, zoom);
  }
}

// A click map with at most one pin. The pin is controlled: `marker` says where
// it is, and a click only reports coordinates, so a parent clearing its guess
// between rounds clears the pin too. Changing `viewKey` re-frames the map on
// the region, which is how a new round starts from the whole region again
// rather than wherever the last guess was zoomed to.
export default function LeafletMap({
  center,
  zoom = 10,
  bbox = null,
  marker = null,
  viewKey = 0,
  onMapClick,
  onReady,
  // Consumers that overlay UI on the top-left corner (the guess map's search
  // box) move the zoom control out of the way; everyone else keeps the default.
  zoomPosition = 'topleft',
  className = "w-full h-full min-h-[400px]"
}) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerRef = useRef(null);
  // Effect events: always call the latest callback props without making them
  // effect dependencies, so a parent re-rendering with a new function identity
  // does not tear the map down.
  const emitMapClick = useEffectEvent((coords) => onMapClick?.(coords));
  const emitReady = useEffectEvent((map) => onReady?.(map));
  const placeMarker = useEffectEvent(() => {
    const map = leafletMapRef.current;
    markerRef.current?.remove();
    markerRef.current = map && marker ? L.marker(marker).addTo(map) : null;
  });
  const reframe = useEffectEvent(() => {
    if (leafletMapRef.current) frameView(leafletMapRef.current, bbox, center, zoom);
  });

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return undefined;

    try {
      // Fix default marker icons issue
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: imageUrl(markerIcon2x),
        iconUrl: imageUrl(markerIcon),
        shadowUrl: imageUrl(markerShadow),
      });

      const map = L.map(mapRef.current, { zoomControl: false });
      L.control.zoom({ position: zoomPosition }).addTo(map);
      frameView(map, bbox, center, zoom);

      const tiles = getTileConfig();
      L.tileLayer(tiles.url, tiles.options).addTo(map);

      map.on('click', (e) => emitMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }));

      leafletMapRef.current = map;
      // A rebuilt map starts empty; put back the pin the parent still holds.
      placeMarker();
      emitReady(map);
    } catch (error) {
      console.error('Error initializing Leaflet map:', error);
    }

    return () => {
      if (!leafletMapRef.current) return;
      try {
        leafletMapRef.current.remove();
      } catch (error) {
        console.warn('Error removing map:', error);
      }
      leafletMapRef.current = null;
      markerRef.current = null;
      // The handle given out by onReady is now a destroyed map; a parent
      // still holding it would crash on the first pan/zoom call.
      emitReady(null);
    };
  }, [bbox, center, zoom, zoomPosition]);

  useEffect(() => {
    placeMarker();
  }, [marker]);

  useEffect(() => {
    reframe();
  }, [viewKey]);

  return (
    <div
      ref={mapRef}
      className={`bg-muted rounded-lg overflow-hidden ${className}`}
    />
  );
}
