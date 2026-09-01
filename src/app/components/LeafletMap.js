"use client";

import { useEffect, useRef } from 'react';
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

export default function LeafletMap({
  center,
  zoom = 10,
  bbox = null,
  onMapClick,
  onReady,
  // Consumers that overlay UI on the top-left corner (the guess map's search
  // box) move the zoom control out of the way; everyone else keeps the default.
  zoomPosition = 'topleft',
  className = "w-full h-full min-h-[400px]"
}) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef([]);
  const onMapClickRef = useRef(onMapClick);
  const onReadyRef = useRef(onReady);

  // Update refs when callbacks change
  onMapClickRef.current = onMapClick;
  onReadyRef.current = onReady;

  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current || leafletMapRef.current) return;

      try {

        // Fix default marker icons issue
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: imageUrl(markerIcon2x),
          iconUrl: imageUrl(markerIcon),
          shadowUrl: imageUrl(markerShadow),
        });

        // Create map
        const map = L.map(mapRef.current, { zoomControl: false });
        L.control.zoom({ position: zoomPosition }).addTo(map);

        // Set initial view - use bbox if provided, otherwise center/zoom
        if (bbox) {
          // bbox format: [west, south, east, north]
          const bounds = L.latLngBounds(
            L.latLng(bbox[1], bbox[0]), // southwest corner
            L.latLng(bbox[3], bbox[2])  // northeast corner
          );
          map.fitBounds(bounds, { padding: [20, 20] });
        } else {
          map.setView(center, zoom);
        }

        // Add tile layer
        const tiles = getTileConfig();
        L.tileLayer(tiles.url, tiles.options).addTo(map);

        // Handle click events
        map.on('click', (e) => {
          if (onMapClickRef.current) {
            // Clear existing markers
            markersRef.current.forEach(marker => {
              map.removeLayer(marker);
            });
            markersRef.current = [];

            // Add new marker
            const marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
            markersRef.current.push(marker);

            // Call callback
            onMapClickRef.current({
              lat: e.latlng.lat,
              lng: e.latlng.lng
            });
          }
        });

        leafletMapRef.current = map;
        
        if (onReadyRef.current) {
          onReadyRef.current(map);
        }

      } catch (error) {
        console.error('Error initializing Leaflet map:', error);
      }
    };

    initMap();

    // Cleanup function
    return () => {
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (error) {
          console.warn('Error removing map:', error);
        }
        leafletMapRef.current = null;
        markersRef.current = [];
        // The handle given out by onReady is now a destroyed map; a parent
        // still holding it would crash on the first pan/zoom call.
        if (onReadyRef.current) {
          onReadyRef.current(null);
        }
      }
    };
  }, [bbox, center, zoom, zoomPosition]); // Include props used in initialization

  // Update view when props change
  useEffect(() => {
    if (leafletMapRef.current) {
      if (bbox) {
        // bbox format: [west, south, east, north]
        const bounds = L.latLngBounds(
          L.latLng(bbox[1], bbox[0]), // southwest corner
          L.latLng(bbox[3], bbox[2])  // northeast corner
        );
        leafletMapRef.current.fitBounds(bounds, { padding: [20, 20] });
      } else if (center) {
        leafletMapRef.current.setView(center, zoom);
      }
    }
  }, [center, zoom, bbox]);

  return (
    <div 
      ref={mapRef} 
      className={`bg-muted rounded-lg overflow-hidden ${className}`}
    />
  );
}