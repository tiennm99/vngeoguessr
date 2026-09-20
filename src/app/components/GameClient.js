"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Beer } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import SoundToggle from './SoundToggle';
import DonateQRModal from './DonateQRModal';
import FirstRoundHint from './FirstRoundHint';
import GuessMapPanel from './GuessMapPanel';
import RoundResultDialog from './RoundResultDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { generateRandomUsername, getUsername, setUsername } from '../../lib/username';
import { setLastRegion } from '../../lib/last-region';
import { playSound } from '../../lib/audio';
// The revealed path comes from /api/guess (the RESOLVED district), not from
// regionPath(pickedRegion) -- computing it client-side from what the player
// chose would make the reveal meaningless for a country round.
import { getRegion, isRegion } from '../../lib/regions';

// Loaded on demand like the Leaflet map: the viewer drags three.js in with
// it, the largest chunk in the app by far, and nothing on the game screen can
// render a panorama until a round has been fetched anyway.
const PanoramaViewer = dynamic(() => import('./PanoramaViewer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" role="status" aria-live="polite">
      <p className="text-neutral-300">Loading panorama...</p>
    </div>
  ),
});

/**
 * The result sound for a score, following the scoring ladder in lib/game.js:
 * 4-5 points is a guess within 100m and worth celebrating, 1-3 is a hit, 0 is
 * a miss.
 * @param {number} score Points awarded, 0 to 5.
 * @returns {string} Key of a sound in lib/audio.js.
 */
function resultSound(score) {
  if (score >= 4) return 'great';
  return score > 0 ? 'good' : 'poor';
}

/**
 * Ask the server for a new round. Throws on failure; touches no state, so the
 * result-screen prefetch can call it without disturbing the round on screen.
 * @param {string} locationCode Region to play.
 * @param {string|null} currentSessionId Session id to reuse, or null for a new one.
 * @returns {Promise<Object>} The /api/new-game payload.
 */
async function fetchNewRound(locationCode, currentSessionId) {
  // Encoded: an unencoded value carrying its own '&sessionId=' would let a
  // shared link choose the session key a victim's round is stored under.
  const params = new URLSearchParams({ region: locationCode });
  if (currentSessionId) params.set('sessionId', currentSessionId);

  const response = await fetch(`/api/new-game?${params.toString()}`);
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'No images found');
  }
  return data;
}

/**
 * The game screen.
 *
 * The region arrives as a prop from the /game/[region] page, which has already
 * resolved and validated it -- so there is no query string to read and nothing
 * to suspend on.
 * @param {Object} props
 * @param {string} props.region Validated, canonical-case region code to play.
 */
export default function GameClient({ region }) {
  const router = useRouter();

  const [imageData, setImageData] = useState(null);
  // Bumped once per applied round and used as the viewer's key. The image URL
  // is not enough: a small district can serve the same panorama twice in a
  // row, and without a remount the viewer never fires 'ready' again, which is
  // what clears roundLoading.
  const [roundKey, setRoundKey] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  // Three loading concerns that must not share a flag: the first load owns the
  // whole screen, a between-rounds load keeps the game chrome up, and a guess
  // submit only spins the button. One flag for all three is how submitting a
  // guess used to unmount the panorama viewer.
  const [initialLoading, setInitialLoading] = useState(true);
  const [roundLoading, setRoundLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // A failed round fetch, shown in place with a retry. Never an alert(): that
  // left an empty screen whose only way out was the browser back button.
  const [loadError, setLoadError] = useState(null);
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
  // This visit's tally, client-side only: rounds submitted and points earned
  // since the page loaded. The result dialog shows leaderboard totals, but
  // those arrive per-board and per-region; this is the simple "how am I doing
  // right now" feedback loop, reset by a reload on purpose.
  const [sessionRounds, setSessionRounds] = useState(0);
  const [sessionPoints, setSessionPoints] = useState(0);
  // On phones the guess map floats over the panorama as a corner minimap and
  // only takes over the screen once tapped. Desktop keeps both side by side and
  // ignores this flag entirely.
  const [mapExpanded, setMapExpanded] = useState(false);

  // What the player picked, resolved through the tree. The page validated the
  // code before rendering, so the isRegion guard is belt-and-braces rather
  // than the load-bearing check it used to be when the code came from a query
  // string this component read itself.
  const pickedRegion = isRegion(region) ? getRegion(region) : null;
  const regionName = pickedRegion ? pickedRegion.name : 'Vietnam';

  const initializingRef = useRef(false);
  // The next round, fetched while the result dialog is open so Next Round can
  // swap it in without a wait. Holds a promise; consumed exactly once.
  const prefetchRef = useRef(null);
  // Bumped by every action that starts a round load. A load compares the
  // epoch it started under before applying: once the watchdog re-enables the
  // controls, a slow fetch can otherwise resolve AFTER the player has moved
  // on and replace the round they are looking at.
  const roundEpochRef = useRef(0);
  // The epoch of the round currently applied to the screen; see applyRound.
  const appliedEpochRef = useRef(0);
  // Back stays live while a guess is in flight, so a submit can resolve after
  // the player has already left for the menu. State updates after that are
  // harmless no-ops; a victory jingle over the home screen is not.
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const applyRound = useCallback((data) => {
    setSessionId(data.sessionId);
    setImageData({
      url: data.imageData.url,
      isPano: data.imageData.isPano
    });
    setRoundKey((key) => key + 1);
    // A no-op on every happy path (round resets already cleared it), but a
    // load that lands late -- released early by the watchdog -- must not
    // inherit a pin the player placed on the panorama it is replacing.
    setGuessCoordinates(null);
    // Marks which epoch the round on screen belongs to, so a late 'ready'
    // from the PREVIOUS round's still-mounted viewer cannot clear the
    // loading flag of the round that is replacing it.
    appliedEpochRef.current = roundEpochRef.current;
    setLoadError(null);
  }, []);

  const loadRound = useCallback(async (locationCode, currentSessionId, epoch) => {
    try {
      const data = await fetchNewRound(locationCode, currentSessionId);
      // Superseded while in flight: the newer action owns the screen and the
      // roundLoading flag, so touch nothing and report nothing to clear.
      if (epoch !== roundEpochRef.current) return true;
      applyRound(data);
      return true;
    } catch (error) {
      if (epoch !== roundEpochRef.current) return true;
      console.error('Error fetching image:', error);
      setImageData(null);
      setSessionId(null);
      setLoadError(error.message || 'No images found');
      return false;
    }
  }, [applyRound]);

  const loadLibrariesAndInitialize = useCallback(async (locationCode) => {
    if (initializingRef.current) return;
    initializingRef.current = true;
    setInitialLoading(true);

    try {
      const code = locationCode.toUpperCase();
      const center = isRegion(code) ? getRegion(code).center : null;
      if (center) setMapCenter(center);
      roundEpochRef.current += 1;
      const loaded = await loadRound(locationCode, null, roundEpochRef.current);
      // Only a region that actually served a round is worth offering as
      // "Continue in ..." on the home page.
      if (loaded && isRegion(code)) setLastRegion(code);
      setInitialized(true);
    } catch (error) {
      console.error('Failed to initialize:', error);
    } finally {
      initializingRef.current = false;
      setInitialLoading(false);
    }
  }, [loadRound]);

  useEffect(() => {
    if (initialized) return;
    const existingUsername = getUsername();
    setUsernameState(existingUsername || '');
    loadLibrariesAndInitialize(region);
  }, [region, loadLibrariesAndInitialize, initialized]);

  const submitGameResult = async (guessCoords) => {
    if (!guessCoords || !sessionId) return null;
    // A deep-linked player may reach their first submit without ever visiting
    // the home page's name prompt. Generate and persist a name here so the
    // leaderboard shows something they can recognise and later edit, rather
    // than a shared "Anonymous" bucket.
    let playerName = username;
    if (!playerName) {
      playerName = generateRandomUsername();
      setUsername(playerName);
      setUsernameState(playerName);
    }

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
      }
      console.error('Failed to submit game result:', data.error);
      // The server says why. An expired round and a write failure used to
      // share one message, and only one of them is anything the player did.
      return { failed: true, reason: data.reason ?? null };
    } catch (error) {
      console.error('Failed to submit game result:', error);
      return { failed: true, reason: null };
    }
  };

  const handlePanoramaReady = useCallback(() => {
    // Only the round of the current epoch may clear the flag; the outgoing
    // viewer stays mounted while its replacement loads and can fire late.
    if (appliedEpochRef.current !== roundEpochRef.current) return;
    setRoundLoading(false);
  }, []);

  const handlePanoramaError = useCallback((error) => {
    console.error('Panorama error:', error);
    if (appliedEpochRef.current !== roundEpochRef.current) return;
    playSound('error');
    setRoundLoading(false);
  }, []);

  // roundLoading normally ends at the viewer's 'ready', but a texture load
  // that stalls fires neither 'ready' nor 'panorama-error', and the flag
  // disables every control except Back. Give the wait a ceiling: after it,
  // the controls come back while the viewer keeps loading underneath.
  useEffect(() => {
    if (!roundLoading) return undefined;
    const timer = setTimeout(() => setRoundLoading(false), 15_000);
    return () => clearTimeout(timer);
  }, [roundLoading]);

  const handleMapClick = (coordinates) => {
    // Before the state update, so the pin lands with the sound rather than
    // after React has re-rendered the map.
    playSound('pin');
    setGuessCoordinates([coordinates.lat, coordinates.lng]);
  };

  // Start fetching the next round while the player reads the result, and warm
  // the browser cache with its image. The wasted lookup when they leave from
  // the dialog is one API call and one self-expiring session.
  const startPrefetch = (locationCode, currentSessionId) => {
    const promise = fetchNewRound(locationCode, currentSessionId).then((data) => {
      if (typeof window !== 'undefined' && data.imageData?.url) {
        const image = new window.Image();
        image.src = data.imageData.url;
      }
      return data;
    });
    // Consumed (and error-handled) in handleNextRound; this keeps an abandoned
    // prefetch from surfacing as an unhandled rejection.
    promise.catch(() => {});
    prefetchRef.current = promise;
  };

  const handleSubmitGuess = async () => {
    if (!guessCoordinates || !imageData || submitting) return;
    // After the guard: a blocked submit stays silent.
    playSound('submit');
    setSubmitting(true);
    const currentSession = sessionId;

    try {
      const submitted = await submitGameResult(guessCoordinates);

      if (submitted && !submitted.failed) {
        setSessionRounds((rounds) => rounds + 1);
        setSessionPoints((points) => points + (submitted.score ?? 0));
        setResult({
          failed: false,
          distance: submitted.distance,
          score: submitted.score,
          exactLocation: submitted.exactLocation,
          scoreLevels: submitted.levels ?? [],
          distanceLevels: submitted.distanceLevels ?? [],
          resolvedPath: submitted.region?.path ?? null,
          // 'district' | 'province' | 'none': how much of the answer's region
          // the guess shared. Display only.
          hit: submitted.hit ?? 'none',
          leaderboardMessage: submitted.leaderboard?.message ?? '',
        });
        if (mountedRef.current) playSound(resultSound(submitted.score ?? 0));
      } else {
        // The guess did not record. Say so instead of rendering a 99999m round,
        // which reads as a real miss and is indistinguishable from one.
        setResult({ failed: true, reason: submitted?.reason ?? null });
        if (mountedRef.current) playSound('error');
      }
    } catch (error) {
      // A throw here means the same thing as a null result: nothing was
      // recorded. One representation for both, so the screen cannot show a
      // confident 99999m miss for a round the server never saw.
      console.error('Error submitting guess:', error);
      setResult({ failed: true, reason: null });
      if (mountedRef.current) playSound('error');
    }

    setSubmitting(false);
    setShowResult(true);
    startPrefetch(region, currentSession);
  };

  // Everything a round accumulates. Both Next Round and Skip come through here,
  // so anything left out leaks into the next round -- a stale failed result in
  // particular would title a good round "Round Not Recorded".
  const resetRoundState = () => {
    setMapExpanded(false);
    setGuessCoordinates(null);
    setResult(null);
  };

  const handleNextRound = async () => {
    // Radix keeps the dialog interactive through its exit animation, so a
    // double-click would issue a second fetch and burn a session.
    if (roundLoading) return;
    playSound('next');
    roundEpochRef.current += 1;
    const epoch = roundEpochRef.current;
    setShowResult(false);
    resetRoundState();
    const currentSession = sessionId;
    setSessionId(null);
    const prefetched = prefetchRef.current;
    prefetchRef.current = null;
    setRoundLoading(true);

    if (prefetched) {
      try {
        const data = await prefetched;
        if (epoch !== roundEpochRef.current) return;
        applyRound(data);
        // roundLoading stays up until the viewer's 'ready' clears it -- the
        // fetch finishing is not the panorama being visible.
        return;
      } catch {
        // The prefetch failed; fall through to a fresh fetch, unless the
        // player already moved on while it was failing.
        if (epoch !== roundEpochRef.current) return;
      }
    }

    const loaded = await loadRound(region, currentSession, epoch);
    if (!loaded) setRoundLoading(false);
  };

  const handleSkipGuess = async () => {
    if (!imageData && !loadError) return;
    playSound('skip');

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
    prefetchRef.current = null;
    roundEpochRef.current += 1;
    setSessionId(null);
    // Skip is also the way out of the error panel; leaving the error up would
    // suppress the spinner and read as a hang while the new round loads.
    setLoadError(null);
    setRoundLoading(true);
    // A fresh id, never the one just skipped: the DEL above is still in
    // flight, and reusing the id let it land after the new round's write and
    // delete a live session.
    const loaded = await loadRound(region, null, roundEpochRef.current);
    if (!loaded) setRoundLoading(false);
  };

  const handleRetryLoad = async () => {
    setLoadError(null);
    roundEpochRef.current += 1;
    setRoundLoading(true);
    const loaded = await loadRound(region, null, roundEpochRef.current);
    if (!loaded) setRoundLoading(false);
  };

  const handleGoBack = () => {
    playSound('click');
    router.push('/');
  };

  // Only the very first load owns the screen. Everything after it keeps the
  // game chrome mounted -- tearing it down destroys the panorama viewer.
  if (initialLoading) {
    return (
      <div className="flex-1 flex items-center justify-center vn-surface">
        <div className="text-center space-y-4 animate-fade-in-up" role="status" aria-live="polite">
          <div className="w-12 h-12 border-4 border-border border-t-brand rounded-full animate-spin mx-auto" aria-hidden="true" />
          <p className="text-foreground text-lg font-medium">Loading panoramic image...</p>
          <p className="text-muted-foreground text-sm">{regionName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 vn-surface flex flex-col overflow-hidden">
      {/* Compact Header. viewportFit:cover hands the layout the display
          cutout on every axis, not just the top: in landscape the notch takes
          a 44-59px bite out of one side, which is exactly where Back sits. */}
      <header className="flex shrink-0 items-center justify-between gap-2 py-2 pl-[calc(0.75rem+env(safe-area-inset-left))] pr-[calc(0.75rem+env(safe-area-inset-right))] pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pl-[calc(1rem+env(safe-area-inset-left))] sm:pr-[calc(1rem+env(safe-area-inset-right))] bg-card border-b border-border shadow-sm">
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
          {/* Truncates rather than pushing the controls off a 360px screen:
              a long district name loses its tail, not the mute button. */}
          <Badge variant="brand" className="max-w-[8rem] truncate text-xs sm:max-w-none" title={regionName}>
            {regionName}
          </Badge>
          {/* This visit's tally; invisible until the first round lands so the
              header opens no colder than it used to, and hidden on phones,
              where the header has no spare width -- the result dialog carries
              the same numbers. */}
          {sessionRounds > 0 && (
            <Badge
              variant="secondary"
              className="hidden text-xs tabular-nums sm:inline-flex"
              title={`${sessionPoints} points in ${sessionRounds} ${sessionRounds === 1 ? 'round' : 'rounds'} this visit`}
            >
              {sessionRounds} {sessionRounds === 1 ? 'round' : 'rounds'} · {sessionPoints} pts
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Both toggles collapse to one cell below sm. Two full groups are
              seven 44px cells, which with Back, the region badge and the beer
              button is more than a 360px header holds; the overflow used to
              clip the right-hand controls out of reach after the first round. */}
          <span className="sm:hidden">
            <ThemeToggle compact />
          </span>
          <span className="hidden sm:inline">
            <ThemeToggle />
          </span>
          {/* Two variants, swapped by breakpoint rather than by a resize
              listener: below sm the header has no room for a second pair of
              44px cells beside ThemeToggle's three, so sound collapses to one
              mute-everything switch.
              The breakpoint class goes on a wrapper, not on the control: the
              control's own class list already sets inline-flex, and `hidden`
              fights it for the same property -- whichever Tailwind emits last
              wins, which is how both variants ended up visible at once. A
              wrapper that is display:none also takes its child out of the
              accessibility tree, so nothing is announced twice. */}
          <span className="sm:hidden">
            <SoundToggle compact />
          </span>
          <span className="hidden sm:inline">
            <SoundToggle />
          </span>
          <Button
            onClick={() => setShowDonate(true)}
            variant="ghost"
            size="sm"
            aria-label="Buy me a beer"
            className="min-h-11 text-muted-foreground hover:text-foreground"
          >
            <Beer className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Buy me a beer</span>
          </Button>
        </div>
      </header>

      {/* Game Content. Phones get a full-bleed panorama with the guess map
          floating over it; lg and up keeps the original two-column split. */}
      <div className="relative flex-1 min-h-0 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:grid lg:grid-cols-2 lg:grid-rows-1 lg:gap-3 lg:py-3 lg:pl-[calc(0.75rem+env(safe-area-inset-left))] lg:pr-[calc(0.75rem+env(safe-area-inset-right))]">
        {/* Panorama Viewer */}
        {/* `isolate` traps the panorama library's internal ladder (it reaches
            9999) inside this pane, so a dialog scrim can still cover it. */}
        <div className="absolute inset-0 isolate bg-neutral-900 overflow-hidden lg:relative lg:rounded-lg">
          {loadError ? (
            <div className="w-full h-full flex items-center justify-center p-6" role="alert">
              <div className="text-center space-y-4 max-w-sm">
                <p className="text-neutral-100 text-lg font-semibold">
                  Couldn&apos;t load a street view image
                </p>
                <p className="text-neutral-400 text-sm">{loadError}</p>
                <div className="flex justify-center gap-3">
                  <Button onClick={handleRetryLoad} disabled={roundLoading}>
                    Try again
                  </Button>
                  <Button onClick={handleGoBack} variant="outline">
                    Back to menu
                  </Button>
                </div>
              </div>
            </div>
          ) : imageData ? (
            <PanoramaViewer
              key={roundKey}
              imageUrl={imageData.url}
              onReady={handlePanoramaReady}
              onError={handlePanoramaError}
              topBarSlot={<FirstRoundHint hasGuess={Boolean(guessCoordinates)} />}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" role="status" aria-live="polite">
              <p className="text-neutral-300">Loading panorama...</p>
            </div>
          )}

          {/* Between-rounds indicator, over the outgoing panorama rather than
              in place of the whole screen. */}
          {roundLoading && !loadError && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900/60"
              role="status"
              aria-live="polite"
            >
              <div className="w-10 h-10 border-4 border-neutral-600 border-t-brand rounded-full animate-spin" aria-hidden="true" />
              <span className="sr-only">Loading next round</span>
            </div>
          )}
        </div>

        {/* Map and Controls. display:contents on mobile so both children
            position against the panorama; from lg up, two grid tracks -- the
            map takes what is left, the action bar takes what it needs.
            Explicit tracks, not a nested flex column: the bar sits four
            indefinite-height containers deep, and Safari versions before 18
            resolve that chain by squeezing the auto-sized sibling to nothing,
            which is how the Submit button went missing on an iPad. */}
        <div className="contents lg:grid lg:grid-rows-[minmax(0,1fr)_auto] lg:min-h-0 lg:gap-3">
          <GuessMapPanel
            center={mapCenter}
            bbox={pickedRegion?.bbox}
            regionCode={pickedRegion?.code ?? 'VN'}
            expanded={mapExpanded}
            onExpandedChange={setMapExpanded}
            hasGuess={Boolean(guessCoordinates)}
            onMapClick={handleMapClick}
          />

          {/* The global footer strip below owns the home-indicator safe area,
              so plain p-3 is enough here. */}
          <div className="absolute inset-x-0 bottom-0 z-(--z-appbar) flex shrink-0 gap-2 border-t border-border bg-card/95 p-3 backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <Button
              onClick={handleSubmitGuess}
              disabled={!guessCoordinates || !imageData || !sessionId || submitting || roundLoading}
              className="flex-1"
              size="lg"
              loading={submitting}
            >
              {submitting ? 'Processing...' : guessCoordinates ? 'Submit Guess' : 'Place a guess first'}
            </Button>
            <Button
              onClick={handleSkipGuess}
              disabled={submitting || roundLoading}
              variant="outline"
              className="px-5"
              title="Skip this location — no penalty"
              aria-label="Skip this location — no penalty"
            >
              Skip
            </Button>
          </div>
        </div>
      </div>

      <RoundResultDialog
        open={showResult}
        // The dialog cannot be dismissed into a dead round: the session was
        // consumed on submit, so the only ways out are Next Round and Menu.
        onOpenChange={() => {}}
        result={result}
        guessCoordinates={guessCoordinates}
        username={username}
        regionName={regionName}
        regionCode={pickedRegion?.code ?? 'VN'}
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
