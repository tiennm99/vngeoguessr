"use client";

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function LeafletMap({ 
  center, 
  zoom = 10, 
  bbox = null,
  onMapClick, 
  onReady,
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
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        // Create map
        const map = L.map(mapRef.current);
        
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
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

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
      }
    };
  }, [bbox, center, zoom]); // Include props used in initialization

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