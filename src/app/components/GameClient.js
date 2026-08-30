"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import PanoramaViewer from './PanoramaViewer';
import ThemeToggle from './ThemeToggle';
import { useCountUp } from '../../lib/use-count-up';
import DonateQRModal from './DonateQRModal';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div role="status" aria-live="polite" className="w-full h-full min-h-[400px] bg-muted flex items-center justify-center text-muted-foreground">Loading map...</div>
});
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  formatDistance,
  getUsername,
  getResultMessage
} from '../../lib/game';
// The revealed path comes from /api/guess (the RESOLVED district), not from
// regionPath(pickedRegion) -- computing it client-side from what the player
// chose would make the reveal meaningless for a country round.
import { getRegion, isRegion } from '../../lib/regions';

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
  // One entry per level the guess credited, innermost first. The old fixed
  // global/city pair cannot express a district round.
  const [scoreLevels, setScoreLevels] = useState([]);
  const [distanceLevels, setDistanceLevels] = useState([]);
  // Where the panorama actually was. Only known after the guess.
  const [resolvedPath, setResolvedPath] = useState(null);
  const [leaderboardMessage, setLeaderboardMessage] = useState('');
  // A failed submission is not a zero-point round. Distinguishing them stops
  // the result screen presenting a write failure as a confident 99999m miss.
  const [submitFailed, setSubmitFailed] = useState(false);
  const [mapCenter, setMapCenter] = useState([10.8231, 106.6297]);
  // On phones the guess map floats over the panorama as a corner minimap and
  // only takes over the screen once tapped. Desktop keeps both side by side and
  // ignores this flag entirely.
  const [mapExpanded, setMapExpanded] = useState(false);

  // What the player picked, resolved through the tree. A bookmarked
  // ?location=DL still works: DL is a district of Lam Dong now, and every node
  // keeps an entry.
  const pickedCode = location.toUpperCase();
  const pickedRegion = isRegion(pickedCode) ? getRegion(pickedCode) : null;
  // Never echo the raw query string: an unknown value would render as the
  // page's own label, and the API uppercases before resolving, so ?region=hn
  // would otherwise show 'hn' while serving a Ha Noi round.
  const regionName = pickedRegion ? pickedRegion.name : 'Vietnam';

  // The result is the payoff of a round, so the score lands by counting up
  // rather than arriving already finished.
  const shownScore = useCountUp(score, showResult);

  const guessMapRef = useRef(null);
  const resultMapRef = useRef(null);
  const resultLeafletMapRef = useRef(null);
  const initializingRef = useRef(false);

  const getRandomImage = useCallback(async (locationCode, currentSessionId = null) => {
    try {
      // Encoded: an unencoded value carrying its own '&sessionId=' would let a
      // shared link choose the session key a victim's round is stored under.
      const params = new URLSearchParams({ region: locationCode });
      if (currentSessionId) params.set('sessionId', currentSessionId);
      const url = `/api/new-game?${params.toString()}`;

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
      const center = isRegion(locationCode) ? getRegion(locationCode).center : null;
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
    // ?region= is the current form; ?location= is what existing links carry.
    const locationParam =
      searchParams.get('region') || searchParams.get('location') || 'TPHCM';
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

  const handleGuessMapReady = useCallback((map) => {
    guessMapRef.current = map;
  }, []);

  // Leaflet caches its container size, so growing or shrinking the minimap
  // leaves it rendering at the old dimensions until it is told to remeasure.
  useEffect(() => {
    const map = guessMapRef.current;
    if (!map) return;
    const timer = setTimeout(() => map.invalidateSize(), 220);
    return () => clearTimeout(timer);
  }, [mapExpanded]);

  const handleMapClick = (coordinates) => {
    setGuessCoordinates([coordinates.lat, coordinates.lng]);
  };

  const handleSubmitGuess = async () => {
    if (!guessCoordinates || !imageData) return;
    setLoading(true);

    try {
      const result = await submitGameResult(guessCoordinates);

      if (result) {
        setSubmitFailed(false);
        setDistance(result.distance);
        setScore(result.score);
        setExactLocation(result.exactLocation);
        setScoreLevels(result.levels ?? []);
        setDistanceLevels(result.distanceLevels ?? []);
        setResolvedPath(result.region?.path ?? null);
        if (result.leaderboard) setLeaderboardMessage(result.leaderboard.message);
      } else {
        // The guess did not record. Say so instead of rendering a 99999m round,
        // which reads as a real miss and is indistinguishable from one.
        setSubmitFailed(true);
        setDistance(0);
        setScore(0);
        setExactLocation(null);
        setScoreLevels([]);
        setDistanceLevels([]);
        setResolvedPath(null);
      }
    } catch (error) {
      // A throw here means the same thing as a null result: nothing was
      // recorded. One representation for both, so the screen cannot show a
      // confident 99999m miss for a round the server never saw.
      console.error('Error submitting guess:', error);
      setSubmitFailed(true);
      setDistance(0);
      setScore(0);
      setExactLocation(null);
      setScoreLevels([]);
      setDistanceLevels([]);
      setResolvedPath(null);
    }

    setLoading(false);
    setShowResult(true);
  };

  // Everything a round accumulates. Both Next Round and Skip come through here,
  // so anything left out leaks into the next round -- a stale submitFailed in
  // particular would title a good round "Round Not Recorded".
  const resetRoundState = () => {
    setMapExpanded(false);
    setGuessCoordinates(null);
    setExactLocation(null);
    setScoreLevels([]);
    setDistanceLevels([]);
    setResolvedPath(null);
    setSubmitFailed(false);
    setLeaderboardMessage('');
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

  // Create result map when dialog opens. Not on the failure path: the map
  // container lives inside the success branch, so its ref is never there and
  // initializeMap would retry ten times against nothing.
  useEffect(() => {
    if (showResult && !submitFailed && guessCoordinates) {
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
    if (s >= 5) return 'bg-green-600';
    if (s >= 4) return 'bg-emerald-600';
    if (s >= 3) return 'bg-amber-600';
    if (s >= 2) return 'bg-orange-600';
    if (s >= 1) return 'bg-red-500';
    return 'bg-neutral-500';
  };

  // Colour alone must not carry the result; every band also gets a word.
  const getScoreLabel = (s) => {
    if (s >= 5) return 'Pinpoint';
    if (s >= 4) return 'Excellent';
    if (s >= 3) return 'Good';
    if (s >= 2) return 'Fair';
    if (s >= 1) return 'Far';
    return 'Missed';
  };

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center vn-gradient-bg">
        <div className="text-center space-y-4 animate-fade-in-up" role="status" aria-live="polite">
          <div className="w-12 h-12 border-4 border-border border-t-brand rounded-full animate-spin mx-auto" aria-hidden="true" />
          <p className="text-foreground text-lg font-medium">Loading panoramic image...</p>
          <p className="text-muted-foreground text-sm">{regionName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh vn-gradient-bg flex flex-col overflow-hidden">
      {/* Compact Header */}
      <header className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] bg-card border-b border-border shadow-sm">
        <Button
          onClick={handleGoBack}
          variant="ghost"
          size="sm"
          aria-label="Back to menu"
          className="min-h-11 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Back</span>
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground hidden sm:inline">VNGeoGuessr</span>
          <Badge variant="brand" className="text-xs">
            {regionName}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            onClick={() => setShowDonate(true)}
            variant="ghost"
            size="sm"
            aria-label="Buy me a beer"
            className="min-h-11 text-muted-foreground hover:text-foreground"
          >
            <span className="text-base leading-none" aria-hidden="true">🍺</span>
            <span className="hidden sm:inline">Buy me a beer</span>
          </Button>
        </div>
      </header>

      {/* Game Content. Phones get a full-bleed panorama with the guess map
          floating over it; lg and up keeps the original two-column split. */}
      <div className="relative flex-1 min-h-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:p-3">
        {/* Panorama Viewer */}
        <div className="absolute inset-0 bg-neutral-900 overflow-hidden lg:static lg:rounded-lg">
          {imageData ? (
            <PanoramaViewer
              key={imageData.id}
              imageUrl={imageData.url}
              onReady={handlePanoramaReady}
              onError={handlePanoramaError}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" role="status" aria-live="polite">
              <p className="text-neutral-300">Loading panorama...</p>
            </div>
          )}
        </div>

        {/* Map and Controls. display:contents on mobile so both children
            position against the panorama; a flex column from lg up. */}
        <div className="contents lg:flex lg:flex-col lg:min-h-0 lg:gap-3">
          <div
            // Frame the map rather than restyling its tiles: a bright map inset
            // in a padded card with real elevation reads as a lit window on
            // dark chrome, which is how GeoGuessr handles the same problem.
            className={`absolute z-[500] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg transition-all duration-200 ease-out bottom-[calc(5.25rem+env(safe-area-inset-bottom))] lg:static lg:inset-auto lg:z-auto lg:h-auto lg:w-auto lg:flex-1 lg:min-h-0 lg:p-1.5 ${
              mapExpanded ? 'inset-x-3 top-3' : 'right-3 h-36 w-36'
            }`}
          >
            <LeafletMap
              center={mapCenter}
              bbox={pickedRegion?.bbox}
              zoom={10}
              onMapClick={handleMapClick}
              onReady={handleGuessMapReady}
              className="w-full h-full"
            />

            {/* Collapsed, the map is only a preview: this cover turns the whole
                minimap into one tap target instead of letting a stray touch
                drop a pin the player cannot see at that size. */}
            {!mapExpanded && (
              <button
                type="button"
                onClick={() => setMapExpanded(true)}
                aria-label="Expand the guess map"
                className="absolute inset-0 z-[1200] flex flex-col items-center justify-center gap-1 bg-background/35 text-xs font-semibold text-foreground backdrop-blur-[1px] lg:hidden"
              >
                <Maximize2 className="size-4" aria-hidden="true" />
                {guessCoordinates ? 'Edit guess' : 'Tap to guess'}
              </button>
            )}

            {mapExpanded && (
              <button
                type="button"
                onClick={() => setMapExpanded(false)}
                aria-label="Collapse the guess map"
                className="absolute top-2 right-2 z-[1200] flex size-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md backdrop-blur lg:hidden"
              >
                <Minimize2 className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-[600] flex gap-2 border-t border-border bg-card/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:pb-0 lg:backdrop-blur-none">
            <Button
              onClick={handleSubmitGuess}
              disabled={!guessCoordinates || loading}
              className="flex-1"
              size="lg"
              loading={loading}
            >
              {loading ? 'Processing...' : guessCoordinates ? 'Submit Guess' : 'Place a guess first'}
            </Button>
            <Button
              onClick={handleSkipGuess}
              disabled={loading}
              variant="outline"
              className="px-5"
            >
              Skip
            </Button>
          </div>
        </div>
      </div>

      {/* Result Modal */}
      <Dialog open={showResult} onOpenChange={() => setShowResult(false)}>
        <DialogContent
          className="sm:max-w-xl max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
          key={showResult ? 'open' : 'closed'}
        >
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold">
              {submitFailed ? 'Round Not Recorded' : 'Round Result'}
            </DialogTitle>
          </DialogHeader>

          {/* Scrollable body: everything between the title and the actions. */}
          <div className="overflow-y-auto -mx-1 px-1 space-y-4">
            {submitFailed ? (
              // A failed submission is not a zero-point round. Showing the
              // score circle here would present a write failure as a real miss,
              // and the player would have no way to tell the difference.
              <div className="space-y-3 py-6 text-center" role="alert">
                <p className="text-lg font-semibold text-foreground">
                  Your guess could not be saved
                </p>
                <p className="text-sm text-muted-foreground">
                  Nothing was scored. The round has ended, so start a new one to try again.
                </p>
              </div>
            ) : (
              <>
            <div className="text-center space-y-4 animate-fade-in-up" role="status" aria-live="polite">
              {/* Score circle */}
              <div className="flex flex-col items-center gap-2 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-white text-3xl font-extrabold tabular-nums shadow-md ring-4 ring-background ${getScoreBg(score)}`}>
                  {shownScore}
                </div>
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {getScoreLabel(score)}
                </span>
              </div>

              <div className="animate-fade-in-up" style={{ animationDelay: '240ms' }}>
                <Badge variant="secondary" className="text-lg font-semibold px-3 py-1 tabular-nums">
                  {formatDistance(distance)} away
                </Badge>
              </div>

              <p className="text-muted-foreground text-sm animate-fade-in-up" style={{ animationDelay: '320ms' }}>
                {getResultMessage(score, distance)}
              </p>

              {/* Where the panorama actually was. The reveal: for a province or
                  country round the player did not know this until now. */}
              {resolvedPath && (
                <p className="text-sm text-muted-foreground">
                  {resolvedPath.join(' › ')}
                </p>
              )}

              {/* One row per level the guess credited. A district round shows
                  three; a round whose panorama fell outside every district
                  shows two. */}
              {scoreLevels.length > 0 && (
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  {scoreLevels.map((entry) => (
                    <div
                      key={entry.code}
                      className="rounded-lg bg-brand-subtle p-2 text-brand-subtle-foreground"
                    >
                      <p className="font-semibold">{entry.name}</p>
                      <p className="tabular-nums">
                        {entry.score === null ? 'Below top 200' : `Total: ${entry.score}`}
                      </p>
                      {entry.rank && (
                        <p className="text-xs tabular-nums opacity-80">Rank #{entry.rank}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {distanceLevels.some((entry) => entry.rank) && (
                <div className="grid gap-2 text-xs sm:grid-cols-3">
                  {distanceLevels
                    .filter((entry) => entry.rank)
                    .map((entry) => (
                      <div key={entry.code} className="rounded-lg bg-muted p-2">
                        <p className="font-medium text-foreground">{entry.name} distance</p>
                        <p className="tabular-nums text-muted-foreground">Rank #{entry.rank}</p>
                      </div>
                    ))}
                </div>
              )}

              {leaderboardMessage && (
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">{leaderboardMessage}</p>
              )}

              <p className="text-xs text-muted-foreground">
                {username || 'Anonymous'} • {regionName}
              </p>
            </div>

            {/* Result Map */}
            <div className="rounded-lg overflow-hidden border border-border">
              <div
                ref={resultMapRef}
                key={`map-${sessionId}`}
                className="h-52 w-full bg-muted"
                style={{ minHeight: '208px' }}
              />
              <div className="flex justify-between text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 tabular-nums">
                {exactLocation && (
                  <span>Actual: {exactLocation.lat.toFixed(4)}, {exactLocation.lng.toFixed(4)}</span>
                )}
                {guessCoordinates && (
                  <span>Guess: {guessCoordinates[0].toFixed(4)}, {guessCoordinates[1].toFixed(4)}</span>
                )}
              </div>
            </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button onClick={handleNextRound} size="lg" className="flex-[2]">
              Next Round
            </Button>
            <Button onClick={handleGoBack} variant="ghost" className="flex-1">
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
