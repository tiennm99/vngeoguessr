"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import PanoramaViewer from './PanoramaViewer';
import DonateQRModal from './DonateQRModal';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full min-h-[400px] bg-gray-100 flex items-center justify-center text-gray-400">Loading map...</div>
});
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CITIES,
  cityCenters,
  cityNames,
  formatDistance,
  getUsername,
  getResultMessage,
  getAccumulatedScoreMessage
} from '../../lib/game';

export default function GameClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [location, setLocation] = useState('TPHCM');
  const [imageData, setImageData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [guessCoordinates, setGuessCoordinates] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [distance, setDistance] = useState(0);
  const [score, setScore] = useState(0);
  const [exactLocation, setExactLocation] = useState(null);
  const [showDonate, setShowDonate] = useState(false);
  const [username, setUsernameState] = useState('');
  const [globalRank, setGlobalRank] = useState(null);
  const [cityRank, setCityRank] = useState(null);
  const [globalScore, setGlobalScore] = useState(null);
  const [cityScore, setCityScore] = useState(null);
  const [globalDistanceRank, setGlobalDistanceRank] = useState(null);
  const [cityDistanceRank, setCityDistanceRank] = useState(null);
  const [leaderboardMessage, setLeaderboardMessage] = useState('');
  const [mapCenter, setMapCenter] = useState([10.8231, 106.6297]);

  const resultMapRef = useRef(null);
  const resultLeafletMapRef = useRef(null);
  const initializingRef = useRef(false);

  const getRandomImage = useCallback(async (locationCode, currentSessionId = null) => {
    try {
      const url = currentSessionId ?
        `/api/new-game?city=${locationCode}&sessionId=${currentSessionId}` :
        `/api/new-game?city=${locationCode}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setSessionId(data.sessionId);
        setImageData({
          id: data.imageData.id,
          url: data.imageData.url,
          isPano: data.imageData.isPano
        });
        setLoading(false);
      } else {
        throw new Error(data.error || 'No images found');
      }
    } catch (error) {
      console.error('Error fetching image:', error);
      setImageData(null);
      setSessionId(null);
      setLoading(false);
      alert(`Failed to load street view image: ${error.message || 'No images found'}`);
    }
  }, []);

  const loadLibrariesAndInitialize = useCallback(async (locationCode) => {
    if (initializingRef.current) return;
    initializingRef.current = true;
    setLoading(true);

    try {
      const center = cityCenters[locationCode];
      if (center) setMapCenter(center);
      await getRandomImage(locationCode);
      setInitialized(true);
    } catch (error) {
      console.error('Failed to initialize:', error);
      setLoading(false);
    } finally {
      initializingRef.current = false;
    }
  }, [getRandomImage]);

  useEffect(() => {
    if (initialized) return;
    const locationParam = searchParams.get('location') || 'TPHCM';
    setLocation(locationParam);
    const existingUsername = getUsername();
    setUsernameState(existingUsername || '');
    loadLibrariesAndInitialize(locationParam);
  }, [searchParams, loadLibrariesAndInitialize, initialized]);

  const submitGameResult = async (guessCoords) => {
    if (!guessCoords || !sessionId) return null;
    const playerName = username || 'Anonymous';

    try {
      const response = await fetch('/api/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: playerName,
          guessLat: guessCoords[0],
          guessLng: guessCoords[1],
          sessionId
        })
      });

      const data = await response.json();
      if (data.success) {
        return { ...data.gameResult, leaderboard: data.leaderboard };
      } else {
        console.error('Failed to submit game result:', data.error);
        return null;
      }
    } catch (error) {
      console.error('Failed to submit game result:', error);
      return null;
    }
  };

  const handlePanoramaReady = useCallback(() => {
    setLoading(false);
  }, []);

  const handlePanoramaError = useCallback((error) => {
    console.error('Panorama error:', error);
    setLoading(false);
  }, []);

  const handleMapClick = (coordinates) => {
    setGuessCoordinates([coordinates.lat, coordinates.lng]);
  };

  const handleSubmitGuess = async () => {
    if (!guessCoordinates || !imageData) return;
    setLoading(true);

    try {
      const result = await submitGameResult(guessCoordinates);

      if (result) {
        setDistance(result.distance);
        setScore(result.score);
        setExactLocation(result.exactLocation);
        setGlobalRank(result.globalRank);
        setCityRank(result.cityRank);
        setGlobalDistanceRank(result.globalDistanceRank);
        setCityDistanceRank(result.cityDistanceRank);

        if (result.leaderboard) {
          if (result.leaderboard.global) setGlobalScore(result.leaderboard.global.score);
          if (result.leaderboard.city) setCityScore(result.leaderboard.city.score);
          setLeaderboardMessage(result.leaderboard.message);
        }
      } else {
        setDistance(99999);
        setScore(0);
        setExactLocation(null);
        setGlobalRank(null);
        setCityRank(null);
      }
    } catch (error) {
      console.error('Error submitting guess:', error);
      setDistance(99999);
      setScore(0);
      setExactLocation(null);
      setGlobalRank(null);
      setCityRank(null);
      setGlobalDistanceRank(null);
      setCityDistanceRank(null);
    }

    setLoading(false);
    setShowResult(true);
  };

  const resetRoundState = () => {
    setGuessCoordinates(null);
    setGlobalRank(null);
    setCityRank(null);
    setGlobalScore(null);
    setCityScore(null);
    setGlobalDistanceRank(null);
    setCityDistanceRank(null);
    setExactLocation(null);
  };

  const handleNextRound = () => {
    setShowResult(false);
    resetRoundState();
    const currentSession = sessionId;
    setSessionId(null);
    getRandomImage(location, currentSession);
  };

  const handleSkipGuess = async () => {
    if (!imageData) return;

    try {
      if (sessionId) {
        fetch('/api/skip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        }).catch(error => console.error('Error cleaning up session:', error));
      }
    } catch (error) {
      console.error('Error cleaning up session:', error);
    }

    resetRoundState();
    const currentSession = sessionId;
    setSessionId(null);
    getRandomImage(location, currentSession);
  };

  const handleGoBack = () => {
    router.push('/');
  };

  // Create result map when dialog opens
  useEffect(() => {
    if (showResult && guessCoordinates) {
      if (resultLeafletMapRef.current) {
        resultLeafletMapRef.current.remove();
        resultLeafletMapRef.current = null;
      }

      let retryCount = 0;
      const initializeMap = async () => {
        if (!resultMapRef.current) {
          if (retryCount++ >= 10) return;
          setTimeout(initializeMap, 100);
          return;
        }

        try {
          const L = (await import('leaflet')).default;
          await import('leaflet/dist/leaflet.css');

          delete L.Icon.Default.prototype._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          });

          const map = L.map(resultMapRef.current, {
            preferCanvas: true,
            attributionControl: true
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
          }).addTo(map);

          const markers = [];

          const redIcon = L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          const guessMarker = L.marker([guessCoordinates[0], guessCoordinates[1]], {
            icon: redIcon
          }).addTo(map).bindPopup("Your Guess");
          markers.push(guessMarker);

          if (exactLocation) {
            const greenIcon = L.divIcon({
              className: 'custom-div-icon',
              html: '<div style="background-color: #22c55e; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });

            const trueLocationMarker = L.marker([exactLocation.lat, exactLocation.lng], {
              icon: greenIcon
            }).addTo(map).bindPopup("Actual Location");
            markers.push(trueLocationMarker);

            L.polyline([
              [exactLocation.lat, exactLocation.lng],
              [guessCoordinates[0], guessCoordinates[1]]
            ], { color: '#da251d', weight: 3, dashArray: '8 4' }).addTo(map);
          }

          if (markers.length > 1) {
            const featureGroup = new L.featureGroup(markers);
            map.fitBounds(featureGroup.getBounds(), { padding: [20, 20], maxZoom: 16 });
          } else {
            map.setView([guessCoordinates[0], guessCoordinates[1]], 13);
          }

          setTimeout(() => map.invalidateSize(), 100);
          setTimeout(() => map.invalidateSize(), 500);

          resultLeafletMapRef.current = map;
        } catch (error) {
          console.error('Error creating result map:', error);
        }
      };

      setTimeout(initializeMap, 300);
    }
  }, [showResult, exactLocation, guessCoordinates]);

  useEffect(() => {
    if (!showResult && resultLeafletMapRef.current) {
      resultLeafletMapRef.current.remove();
      resultLeafletMapRef.current = null;
    }
  }, [showResult]);

  const getScoreBg = (s) => {
    if (s >= 5) return 'bg-green-500';
    if (s >= 4) return 'bg-emerald-500';
    if (s >= 3) return 'bg-amber-500';
    if (s >= 2) return 'bg-orange-500';
    if (s >= 1) return 'bg-red-400';
    return 'bg-gray-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center vn-gradient-bg">
        <div className="text-center space-y-4 animate-fade-in-up">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-white/80 text-lg font-medium">Loading panoramic image...</p>
          <p className="text-white/50 text-sm">{cityNames[location] || location}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Compact Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm">
        <Button
          onClick={handleGoBack}
          variant="ghost"
          size="sm"
          className="text-gray-600 hover:text-gray-900"
        >
          ← Back
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-800 hidden sm:inline">VNGeoGuessr</span>
          <Badge className="bg-red-600 text-white text-xs">
            {cityNames[location] || location}
          </Badge>
        </div>

        <Button
          onClick={() => setShowDonate(true)}
          variant="ghost"
          size="sm"
          className="text-gray-600 hover:text-gray-900"
        >
          Buy me a coffee
        </Button>
      </header>

      {/* Game Content */}
      <div className="flex-1 p-3 grid lg:grid-cols-2 gap-3" style={{ height: 'calc(100vh - 52px)' }}>
        {/* Panorama Viewer */}
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          {imageData ? (
            <PanoramaViewer
              key={imageData.id}
              imageUrl={imageData.url}
              onReady={handlePanoramaReady}
              onError={handlePanoramaError}
            />
          ) : (
            <div className="w-full h-full min-h-[400px] flex items-center justify-center">
              <p className="text-gray-400">Loading panorama...</p>
            </div>
          )}
        </div>

        {/* Map and Controls */}
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-lg overflow-hidden flex-1 shadow-sm border border-gray-200">
            <LeafletMap
              center={mapCenter}
              bbox={CITIES[location]?.bbox}
              zoom={10}
              onMapClick={handleMapClick}
              className="w-full h-full min-h-[400px]"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSubmitGuess}
              disabled={!guessCoordinates || loading}
              className="flex-1 py-4 text-base font-bold bg-red-600 hover:bg-red-700 text-white"
              size="lg"
            >
              {loading ? 'Processing...' : guessCoordinates ? 'Submit Guess' : 'Click the map first'}
            </Button>
            <Button
              onClick={handleSkipGuess}
              disabled={loading}
              variant="outline"
              className="py-4 px-5 text-base font-medium"
              size="lg"
            >
              Skip
            </Button>
          </div>
        </div>
      </div>

      {/* Result Modal */}
      <Dialog open={showResult} onOpenChange={() => setShowResult(false)}>
        <DialogContent className="sm:max-w-xl" key={showResult ? 'open' : 'closed'}>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold">Round Result</DialogTitle>
          </DialogHeader>

          <div className="text-center space-y-4 animate-fade-in-up">
            {/* Score circle */}
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-white text-3xl font-extrabold ${getScoreBg(score)} animate-pulse-glow`}>
              {score}
            </div>

            <div>
              <Badge variant="outline" className="text-lg font-semibold text-blue-600 px-3 py-1">
                {formatDistance(distance)} away
              </Badge>
            </div>

            <p className="text-gray-600 text-sm">{getResultMessage(score, distance)}</p>

            {/* Leaderboard ranks */}
            {(globalScore !== null || cityScore !== null) && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {cityScore !== null && (
                  <div className="bg-blue-50 rounded-lg p-2">
                    <p className="font-semibold text-blue-700">{cityNames[location]}</p>
                    <p className="text-blue-600">Total: {cityScore}</p>
                    {cityRank && <p className="text-blue-400 text-xs">Rank #{cityRank}</p>}
                  </div>
                )}
                {globalScore !== null && (
                  <div className="bg-purple-50 rounded-lg p-2">
                    <p className="font-semibold text-purple-700">Global</p>
                    <p className="text-purple-600">Total: {globalScore}</p>
                    {globalRank && <p className="text-purple-400 text-xs">Rank #{globalRank}</p>}
                  </div>
                )}
              </div>
            )}

            {(globalDistanceRank !== null || cityDistanceRank !== null) && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {cityDistanceRank !== null && (
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="font-medium text-gray-700">{cityNames[location]} Distance</p>
                    <p className="text-gray-500">Rank #{cityDistanceRank}</p>
                  </div>
                )}
                {globalDistanceRank !== null && (
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="font-medium text-gray-700">Global Distance</p>
                    <p className="text-gray-500">Rank #{globalDistanceRank}</p>
                  </div>
                )}
              </div>
            )}

            {leaderboardMessage && (
              <p className="text-sm text-green-600 font-medium">{leaderboardMessage}</p>
            )}

            <p className="text-xs text-gray-400">
              {username || 'Anonymous'} • {cityNames[location] || location}
            </p>
          </div>

          {/* Result Map */}
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <div
              ref={resultMapRef}
              key={`map-${sessionId}`}
              className="h-52 w-full bg-gray-100"
              style={{ minHeight: '208px' }}
            />
            <div className="flex justify-between text-xs text-gray-400 px-3 py-1.5 bg-gray-50">
              {exactLocation && (
                <span>Actual: {exactLocation.lat.toFixed(4)}, {exactLocation.lng.toFixed(4)}</span>
              )}
              {guessCoordinates && (
                <span>Guess: {guessCoordinates[0].toFixed(4)}, {guessCoordinates[1].toFixed(4)}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleNextRound}
              size="lg"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              Next Round
            </Button>
            <Button
              onClick={handleGoBack}
              variant="outline"
              size="lg"
              className="flex-1"
            >
              Menu
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Donate Modal */}
      <DonateQRModal
        isOpen={showDonate}
        onClose={() => setShowDonate(false)}
      />
    </div>
  );
}
