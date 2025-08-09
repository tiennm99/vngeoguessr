"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import PanoramaViewer from './PanoramaViewer';
import LeafletMap from './LeafletMap';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  cityCenters,
  cityNames,
  formatDistance,
  formatTime,
  getUsername,
  getResultMessage
} from '../../lib/game';

export default function GameClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [location, setLocation] = useState('HN');
  const [imageData, setImageData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guessCoordinates, setGuessCoordinates] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [distance, setDistance] = useState(0);
  const [score, setScore] = useState(0);
  const [exactLocation, setExactLocation] = useState(null);
  const [showDonate, setShowDonate] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [timerActive, setTimerActive] = useState(false);
  const [username, setUsernameState] = useState('');
  const [leaderboardRank, setLeaderboardRank] = useState(null);
  const [mapCenter, setMapCenter] = useState([21.0285, 105.8542]); // Default to Hanoi

  useEffect(() => {
    const locationParam = searchParams.get('location') || 'HN';
    setLocation(locationParam);

    // Get existing username (should be set from home page)
    const existingUsername = getUsername();
    setUsernameState(existingUsername || '');
    
    // Initialize the game
    loadLibrariesAndInitialize(locationParam);
  }, [searchParams]);

  useEffect(() => {
    let interval;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => time - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerActive) {
      // Time's up - auto submit or show result
      handleTimeUp();
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  const handleTimeUp = () => {
    setTimerActive(false);
    if (guessCoordinates) {
      handleSubmitGuess();
    } else {
      // No guess made, submit with no coordinates (max distance)
      if (sessionId) {
        submitGameResult([0, 0]).then(result => {
          if (result) {
            setDistance(result.distance);
            setScore(result.score);
            setExactLocation(result.exactLocation);
            setLeaderboardRank(result.rank);
          } else {
            setDistance(99999);
            setScore(0);
            setExactLocation(null);
            setLeaderboardRank(null);
          }
          setShowResult(true);
        }).catch(() => {
          setDistance(99999);
          setScore(0);
          setExactLocation(null);
          setShowResult(true);
        });
      } else {
        setDistance(99999);
        setScore(0);
        setExactLocation(null);
        setShowResult(true);
      }
    }
  };


  const submitGameResult = async (guessCoords) => {
    if (!guessCoords || !sessionId) return null;
    
    // Use username or default to 'Anonymous' if not set
    const playerName = username || 'Anonymous';

    try {
      const response = await fetch('/api/guess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: playerName,
          guessLat: guessCoords[0],
          guessLng: guessCoords[1],
          sessionId,
          timeLeft
        })
      });

      const data = await response.json();
      if (data.success) {
        console.log(`Game result processed. Distance: ${data.gameResult.distance}m, Score: ${data.gameResult.score}, Rank: ${data.gameResult.rank}`);
        return data.gameResult;
      } else {
        console.error('Failed to submit game result:', data.error);
        return null;
      }
    } catch (error) {
      console.error('Failed to submit game result:', error);
      return null;
    }
  };

  const loadLibrariesAndInitialize = async (locationCode) => {
    setLoading(true);
    try {
      // Set map center based on location
      const center = cityCenters[locationCode];
      if (center) {
        setMapCenter(center);
      }

      await getRandomImage(locationCode);
    } catch (error) {
      console.error('Failed to initialize:', error);
      setLoading(false);
    }
  };

  const handlePanoramaReady = useCallback(() => {
    setLoading(false);
    console.log('Panorama viewer ready');
  }, []);

  const handlePanoramaError = useCallback((error) => {
    console.error('Panorama error:', error);
    setLoading(false);
  }, []);

  const handleMapClick = (coordinates) => {
    setGuessCoordinates([coordinates.lat, coordinates.lng]);
    console.log('Map clicked at:', coordinates);
  };

  const getRandomImage = async (locationCode) => {
    try {
      console.log('Fetching random image for city:', locationCode);
      const url = sessionId ?
        `/api/new-game?city=${locationCode}&sessionId=${sessionId}` :
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
        setTimerActive(true);
        // Don't set loading to false here - let PanoramaViewer handle it when ready

        console.log(`Image loaded. Used ${data.searchInfo.radiusUsed}km radius (attempt ${data.searchInfo.attempt})`);
      } else {
        throw new Error(data.error || 'No images found');
      }
    } catch (error) {
      console.error('Error fetching image after all retries:', error);
      console.error('Error details:', error.message);

      // Set imageData to null to trigger error display in PanoramaViewer
      setImageData(null);
      setSessionId(null);

      setLoading(false);

      // Only show error after all retries are complete
      // The API already handles retries internally
      alert(`Failed to load street view image after trying different search areas: ${error.message || 'No images found'}`);
    }
  };


  const handleSubmitGuess = async () => {
    if (!guessCoordinates || !imageData) return;

    setTimerActive(false);
    setLoading(true);

    try {
      // Submit to server for processing
      const result = await submitGameResult(guessCoordinates);

      if (result) {
        // Use server-calculated values
        setDistance(result.distance);
        setScore(result.score);
        setExactLocation(result.exactLocation);
        setLeaderboardRank(result.rank);
      } else {
        // Fallback: no calculation possible without exact location
        setDistance(99999);
        setScore(0);
        setExactLocation(null);
        setLeaderboardRank(null);
      }
    } catch (error) {
      console.error('Error submitting guess:', error);

      // Fallback: no calculation possible
      setDistance(99999);
      setScore(0);
      setExactLocation(null);
      setLeaderboardRank(null);
    }

    setLoading(false);
    setShowResult(true);
  };

  const handleNextRound = () => {
    setShowResult(false);
    setGuessCoordinates(null);
    setTimeLeft(180);
    setTimerActive(false);
    setLeaderboardRank(null);
    setExactLocation(null);
    setSessionId(null);
    getRandomImage(location);
  };

  const handleGoBack = () => {
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-400 via-blue-500 to-purple-600">
        <Card className="w-80">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <Skeleton className="h-12 w-12 rounded-full mx-auto" />
              <Skeleton className="h-4 w-48 mx-auto" />
              <p className="text-muted-foreground">Loading panoramic image...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600">
      <div className="min-h-screen bg-black/20">
        {/* Header */}
        <header className="flex justify-between items-center p-4 bg-black/20">
          <Button
            onClick={handleGoBack}
            variant="destructive"
            className="flex items-center gap-2"
          >
            <span>←</span>
            <span>Back</span>
          </Button>

          <div className="text-center">
            <div className="text-white text-2xl font-bold">VNGEOGUESSR</div>
            <Badge variant="secondary" className="text-lg bg-yellow-500 text-black">
              Time: {formatTime(timeLeft)}
            </Badge>
          </div>

          <Button
            onClick={() => setShowDonate(true)}
            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            <span>☕</span>
            <span>Donate</span>
          </Button>
        </header>

        {/* Game Content */}
        <div className="p-4 grid lg:grid-cols-2 gap-4 h-[calc(100vh-100px)]">
          {/* Panorama Viewer */}
          <div className="bg-black rounded-lg overflow-hidden">
            {imageData ? (
              <PanoramaViewer
                imageUrl={imageData.url}
                onReady={handlePanoramaReady}
                onError={handlePanoramaError}
              />
            ) : (
              <div className="w-full h-full min-h-[400px] flex items-center justify-center">
                <div className="text-white">Loading panorama...</div>
              </div>
            )}
          </div>

          {/* Map and Submit */}
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-lg overflow-hidden flex-1">
              <LeafletMap
                center={mapCenter}
                zoom={10}
                onMapClick={handleMapClick}
                className="w-full h-full min-h-[400px]"
              />
            </div>
            <Button
              onClick={handleSubmitGuess}
              disabled={!guessCoordinates || loading}
              className="w-full py-4 text-lg font-bold"
              size="lg"
            >
              {loading ? 'PROCESSING...' : 'SUBMIT GUESS'}
            </Button>
          </div>
        </div>

        {/* Result Modal */}
        <Dialog open={showResult} onOpenChange={() => setShowResult(false)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-3xl text-center">RESULT</DialogTitle>
            </DialogHeader>

            <div className="text-center space-y-4">
              <Badge variant="secondary" className="text-2xl font-bold text-blue-600 px-4 py-2">
                {formatDistance(distance)} away
              </Badge>

              <div className="text-xl">
                Score: <Badge className="text-lg font-bold bg-green-600">{score}/5 points</Badge>
              </div>

              {leaderboardRank && (
                <Badge variant="outline" className="text-lg text-purple-600 font-semibold">
                  Vietnam Leaderboard Rank: #{leaderboardRank}
                </Badge>
              )}

              <p className="text-sm text-muted-foreground">
                Playing as: {username || 'Anonymous'} • City: {cityNames[location] || location}
              </p>
            </div>

            <Card className="my-6">
              <CardContent className="h-64 flex items-center justify-center p-6">
                <div className="text-center text-muted-foreground space-y-2">
                  <div className="text-lg mb-4">📍 Actual Location vs Your Guess</div>
                  {exactLocation && (
                    <p className="text-sm">
                      Actual: {exactLocation.lat.toFixed(4)}, {exactLocation.lng.toFixed(4)}
                    </p>
                  )}
                  {guessCoordinates && (
                    <p className="text-sm">
                      Guess: {guessCoordinates[0].toFixed(4)}, {guessCoordinates[1].toFixed(4)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="text-center space-y-4">
              <p className="text-lg">
                {getResultMessage(score, distance)}
              </p>
              <div className="flex gap-4 justify-center">
                <Button
                  onClick={handleNextRound}
                  size="lg"
                  className="px-8 py-3"
                >
                  NEXT ROUND
                </Button>
                <Button
                  onClick={handleGoBack}
                  variant="secondary"
                  size="lg"
                  className="px-8 py-3"
                >
                  MENU
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>


        {/* Donate Modal */}
        <Dialog open={showDonate} onOpenChange={setShowDonate}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl text-center">DONATE HERE</DialogTitle>
            </DialogHeader>

            <div className="text-center space-y-6">
              <Card className="w-64 h-64 mx-auto">
                <CardContent className="h-full flex items-center justify-center">
                  <span className="text-muted-foreground">QR Code Placeholder</span>
                </CardContent>
              </Card>

              <Button
                onClick={() => setShowDonate(false)}
                className="px-6"
              >
                CLOSE
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
