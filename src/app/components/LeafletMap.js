"use client";

import { useEffect, useRef } from 'react';

export default function LeafletMap({ 
  center, 
  zoom = 10, 
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
        // Dynamically import Leaflet and its CSS
        const [L] = await Promise.all([
          import('leaflet'),
          import('leaflet/dist/leaflet.css')
        ]);

        // Fix default marker icons issue
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        // Create map
        const map = L.map(mapRef.current).setView(center, zoom);

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
  }, []); // Empty deps - callbacks handled via refs

  // Update center when prop changes
  useEffect(() => {
    if (leafletMapRef.current && center) {
      leafletMapRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  return (
    <div 
      ref={mapRef} 
      className={`bg-gray-200 rounded-lg overflow-hidden ${className}`}
    />
  );
}