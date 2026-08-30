"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PanoramaViewer from './PanoramaViewer';
import ThemeToggle from './ThemeToggle';
import DonateQRModal from './DonateQRModal';
import GuessMapPanel from './GuessMapPanel';
import RoundResultDialog from './RoundResultDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getUsername } from '../../lib/username';
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
  // Everything a submitted round produced, in one object set in exactly one
  // place per outcome. null until a round has been submitted; failed:true
  // marks a round the server never recorded, so the result screen cannot
  // present a write failure as a confident 99999m miss.
  const [result, setResult] = useState(null);
  const [showDonate, setShowDonate] = useState(false);
  const [username, setUsernameState] = useState('');
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

  const handleMapClick = (coordinates) => {
    setGuessCoordinates([coordinates.lat, coordinates.lng]);
  };

  const handleSubmitGuess = async () => {
    if (!guessCoordinates || !imageData) return;
    setLoading(true);

    try {
      const submitted = await submitGameResult(guessCoordinates);

      if (submitted) {
        setResult({
          failed: false,
          distance: submitted.distance,
          score: submitted.score,
          exactLocation: submitted.exactLocation,
          scoreLevels: submitted.levels ?? [],
          distanceLevels: submitted.distanceLevels ?? [],
          resolvedPath: submitted.region?.path ?? null,
          leaderboardMessage: submitted.leaderboard?.message ?? '',
        });
      } else {
        // The guess did not record. Say so instead of rendering a 99999m round,
        // which reads as a real miss and is indistinguishable from one.
        setResult({ failed: true });
      }
    } catch (error) {
      // A throw here means the same thing as a null result: nothing was
      // recorded. One representation for both, so the screen cannot show a
      // confident 99999m miss for a round the server never saw.
      console.error('Error submitting guess:', error);
      setResult({ failed: true });
    }

    setLoading(false);
    setShowResult(true);
  };

  // Everything a round accumulates. Both Next Round and Skip come through here,
  // so anything left out leaks into the next round -- a stale failed result in
  // particular would title a good round "Round Not Recorded".
  const resetRoundState = () => {
    setMapExpanded(false);
    setGuessCoordinates(null);
    setResult(null);
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
              key={imageData.url}
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
          <GuessMapPanel
            center={mapCenter}
            bbox={pickedRegion?.bbox}
            expanded={mapExpanded}
            onExpandedChange={setMapExpanded}
            hasGuess={Boolean(guessCoordinates)}
            onMapClick={handleMapClick}
          />

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

      <RoundResultDialog
        open={showResult}
        onOpenChange={() => setShowResult(false)}
        result={result}
        guessCoordinates={guessCoordinates}
        username={username}
        regionName={regionName}
        onNextRound={handleNextRound}
        onMenu={handleGoBack}
      />

      {/* Donate Modal */}
      <DonateQRModal
        isOpen={showDonate}
        onClose={() => setShowDonate(false)}
      />
    </div>
  );
}
