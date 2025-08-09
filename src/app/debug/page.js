"use client";

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import LeafletMap from '../components/LeafletMap';

export default function DebugPage() {
  const [bbox, setBbox] = useState('105.8,21.0,105.9,21.1'); // Default: Hanoi area
  const [parsedBbox, setParsedBbox] = useState(null);
  const [mapCenter, setMapCenter] = useState([21.05, 105.85]);
  const [mapZoom, setMapZoom] = useState(12);
  const [error, setError] = useState('');
  const [mapillaryResults, setMapillaryResults] = useState(null);
  const [loading, setLoading] = useState(false);

  // Parse bbox string to coordinates
  const parseBbox = (bboxString) => {
    const coords = bboxString.split(',').map(coord => parseFloat(coord.trim()));
    if (coords.length !== 4) {
      throw new Error('Bbox must have exactly 4 coordinates: minLng,minLat,maxLng,maxLat');
    }
    
    const [minLng, minLat, maxLng, maxLat] = coords;
    
    // Validate coordinates
    if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
      throw new Error('All coordinates must be valid numbers');
    }
    
    if (minLng >= maxLng || minLat >= maxLat) {
      throw new Error('Invalid bbox: min values must be less than max values');
    }
    
    if (Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) {
      throw new Error('Latitude must be between -90 and 90');
    }
    
    if (Math.abs(minLng) > 180 || Math.abs(maxLng) > 180) {
      throw new Error('Longitude must be between -180 and 180');
    }
    
    return { minLng, minLat, maxLng, maxLat };
  };

  const handleVisualizeBbox = () => {
    try {
      setError('');
      const parsed = parseBbox(bbox);
      setParsedBbox(parsed);
      
      // Set map center to bbox center
      const centerLat = (parsed.minLat + parsed.maxLat) / 2;
      const centerLng = (parsed.minLng + parsed.maxLng) / 2;
      setMapCenter([centerLat, centerLng]);
      
      // Adjust zoom based on bbox size
      const latRange = parsed.maxLat - parsed.minLat;
      const lngRange = parsed.maxLng - parsed.minLng;
      const maxRange = Math.max(latRange, lngRange);
      
      let zoom = 10;
      if (maxRange < 0.01) zoom = 16;
      else if (maxRange < 0.02) zoom = 15;
      else if (maxRange < 0.05) zoom = 14;
      else if (maxRange < 0.1) zoom = 13;
      else if (maxRange < 0.2) zoom = 12;
      else if (maxRange < 0.5) zoom = 11;
      
      setMapZoom(zoom);
      
    } catch (err) {
      setError(err.message);
      setParsedBbox(null);
    }
  };

  const handleTestMapillary = async () => {
    if (!parsedBbox) {
      setError('Please visualize the bbox first');
      return;
    }

    setLoading(true);
    setMapillaryResults(null);
    
    try {
      const response = await fetch('/api/debug/mapillary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bbox })
      });

      const data = await response.json();
      setMapillaryResults(data);
      
    } catch (err) {
      setError('Failed to test Mapillary API: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMapReady = useCallback(async (map) => {
    if (parsedBbox && map) {
      // Clear existing layers
      map.eachLayer((layer) => {
        if (layer.options && layer.options.debugLayer) {
          map.removeLayer(layer);
        }
      });

      try {
        // Import Leaflet dynamically to access L
        const L = await import('leaflet');
        
        // Add bbox rectangle
        const rectangle = L.rectangle(
          [[parsedBbox.minLat, parsedBbox.minLng], [parsedBbox.maxLat, parsedBbox.maxLng]],
          {
            color: '#ff0000',
            weight: 2,
            fillOpacity: 0.1,
            debugLayer: true
          }
        ).addTo(map);

        // Add center point
        const centerLat = (parsedBbox.minLat + parsedBbox.maxLat) / 2;
        const centerLng = (parsedBbox.minLng + parsedBbox.maxLng) / 2;
        
        L.marker([centerLat, centerLng], { debugLayer: true })
          .addTo(map)
          .bindPopup(`Center: ${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}`);

        // Fit map to bbox
        map.fitBounds([[parsedBbox.minLat, parsedBbox.minLng], [parsedBbox.maxLat, parsedBbox.maxLng]]);
      } catch (error) {
        console.error('Error adding bbox visualization:', error);
      }
    }
  }, [parsedBbox]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600">
      <div className="min-h-screen bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Debug Tool</h1>
              <p className="text-white/80">Bbox Visualization & Mapillary Testing</p>
            </div>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </header>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Controls Panel */}
            <Card className="bg-white/10 backdrop-blur-md border-white/20">
              <CardHeader>
                <CardTitle className="text-white">Bbox Input</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="bbox" className="text-white">
                    Bounding Box (minLng,minLat,maxLng,maxLat)
                  </Label>
                  <Input
                    id="bbox"
                    value={bbox}
                    onChange={(e) => setBbox(e.target.value)}
                    placeholder="105.8,21.0,105.9,21.1"
                    className="mt-1"
                  />
                  <p className="text-xs text-white/60 mt-1">
                    Format: longitude1,latitude1,longitude2,latitude2
                  </p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleVisualizeBbox} className="flex-1">
                    Visualize Bbox
                  </Button>
                  <Button 
                    onClick={handleTestMapillary} 
                    disabled={!parsedBbox || loading}
                    variant="secondary"
                    className="flex-1"
                  >
                    {loading ? 'Testing...' : 'Test Mapillary'}
                  </Button>
                </div>

                {parsedBbox && (
                  <Card className="bg-black/20">
                    <CardContent className="p-4">
                      <h4 className="text-white font-semibold mb-2">Parsed Bbox:</h4>
                      <div className="text-sm text-white/80 space-y-1">
                        <div>Min: {parsedBbox.minLng.toFixed(6)}, {parsedBbox.minLat.toFixed(6)}</div>
                        <div>Max: {parsedBbox.maxLng.toFixed(6)}, {parsedBbox.maxLat.toFixed(6)}</div>
                        <div>Size: {((parsedBbox.maxLng - parsedBbox.minLng) * 111).toFixed(2)}km × {((parsedBbox.maxLat - parsedBbox.minLat) * 111).toFixed(2)}km</div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {mapillaryResults && (
                  <Card className="bg-black/20">
                    <CardContent className="p-4">
                      <h4 className="text-white font-semibold mb-2">Mapillary Results:</h4>
                      {mapillaryResults.success ? (
                        <div className="space-y-2">
                          <Badge className="bg-green-600">
                            Found {mapillaryResults.data.length} images
                          </Badge>
                          <div className="text-sm text-white/80 space-y-1">
                            <div>Panoramic images: {mapillaryResults.data.filter(img => img.is_pano).length}</div>
                            <div>Regular images: {mapillaryResults.data.filter(img => !img.is_pano).length}</div>
                            {mapillaryResults.analysis && (
                              <div className="pt-1 border-t border-white/20">
                                <div>Area: {mapillaryResults.analysis.bboxArea.widthKm}km × {mapillaryResults.analysis.bboxArea.heightKm}km</div>
                                <div>Density: {(mapillaryResults.data.length / (parseFloat(mapillaryResults.analysis.bboxArea.widthKm) * parseFloat(mapillaryResults.analysis.bboxArea.heightKm))).toFixed(1)} images/km²</div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Badge variant="destructive">
                            Error: {mapillaryResults.error}
                          </Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>

            {/* Map Panel */}
            <Card className="bg-white/10 backdrop-blur-md border-white/20">
              <CardHeader>
                <CardTitle className="text-white">Map Visualization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96 bg-gray-200 rounded-lg overflow-hidden">
                  <LeafletMap
                    center={mapCenter}
                    zoom={mapZoom}
                    onReady={handleMapReady}
                    className="w-full h-full"
                  />
                </div>
                <p className="text-xs text-white/60 mt-2">
                  Red rectangle shows the bbox area. Center marker shows the bbox center point.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Sample Bboxes */}
          <Card className="mt-8 bg-white/10 backdrop-blur-md border-white/20">
            <CardHeader>
              <CardTitle className="text-white">Sample Bboxes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  { name: 'Hanoi Center', bbox: '105.8,21.0,105.9,21.1' },
                  { name: 'HCMC Center', bbox: '106.6,10.7,106.8,10.9' },
                  { name: 'Da Nang', bbox: '108.1,16.0,108.3,16.1' },
                  { name: 'Small Area (1km)', bbox: '105.85,21.03,105.86,21.04' },
                  { name: 'Large Area (10km)', bbox: '105.5,20.8,106.2,21.3' },
                  { name: 'Custom', bbox: bbox }
                ].map((sample) => (
                  <Button
                    key={sample.name}
                    variant="outline"
                    size="sm"
                    onClick={() => setBbox(sample.bbox)}
                    className="text-xs"
                  >
                    {sample.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}