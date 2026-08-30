"use client";

import Link from "next/link";
import { Trophy, Wrench } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ThemeToggle from './components/ThemeToggle';
import UsernameModal from './components/UsernameModal';
import DonateQRModal from './components/DonateQRModal';
import LeaderboardList from './components/LeaderboardList';
import RegionPicker from './components/RegionPicker';
import RegionSelect from './components/RegionSelect';
import { getUsername, setUsername } from '../lib/game';
import { COUNTRY_CODE, getRegion } from '../lib/regions';

const STEP_LABELS = [
  'Choose a region: the whole country, a province, or one district',
  'View 360° street panorama',
  'Place your guess on the map',
  'Earn points based on accuracy!'
];

export default function Home() {
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [username, setUsernameState] = useState('');
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [level, setLevel] = useState('country');
  const [region, setRegion] = useState(COUNTRY_CODE);
  const [activeTypeTab, setActiveTypeTab] = useState('score');
  const [leaderboards, setLeaderboards] = useState({});
  // Which board failed, so an outage is not shown as an empty board.
  const [leaderboardError, setLeaderboardError] = useState(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const existingUsername = getUsername();
    if (existingUsername) {
      setUsernameState(existingUsername);
    } else {
      setShowUsernameModal(true);
    }
  }, []);

  const handleUsernameSubmit = (newUsername) => {
    setUsername(newUsername);
    setUsernameState(newUsername);
    setShowUsernameModal(false);
  };

  const fetchLeaderboard = async (regionCode, type) => {
    const key = `${regionCode}-${type}`;

    // Bump first: a cache hit still supersedes whatever is in flight, and it
    // has to clear the spinner that request raised or a cached board renders
    // behind skeletons until an unrelated fetch settles.
    const currentFetchId = ++fetchIdRef.current;
    if (leaderboards[key]) {
      setLoadingLeaderboard(false);
      return;
    }

    setLoadingLeaderboard(true);
    try {
      const params = new URLSearchParams({ region: regionCode, type });
      const response = await fetch(`/api/leaderboard?${params.toString()}`);
      const data = await response.json();
      // A newer selection landed while this was in flight.
      if (currentFetchId !== fetchIdRef.current) return;

      if (!response.ok || !data.success) {
        // An empty array here would render as "No scores yet" and be cached as
        // such, so a backend outage would read as wiped leaderboards.
        throw new Error(data.error || `Leaderboard request failed (${response.status})`);
      }
      setLeaderboards((current) => ({ ...current, [key]: data.leaderboard }));
      setLeaderboardError(null);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      if (currentFetchId === fetchIdRef.current) setLeaderboardError(key);
    } finally {
      if (currentFetchId === fetchIdRef.current) setLoadingLeaderboard(false);
    }
  };

  // Only the board on screen is fetched. Fetching every one was viable at five
  // cities; at 67 regions it would be 134 requests on a single click.
  useEffect(() => {
    if (showLeaderboardModal && region) fetchLeaderboard(region, activeTypeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLeaderboardModal, region, activeTypeTab]);

  const handleLeaderboardClick = () => {
    // Cleared on open so a player who just scored does not see their old total.
    // Kept within a session so switching level or type back is free.
    setLeaderboards({});
    setLeaderboardError(null);
    setShowLeaderboardModal(true);
  };

  const rows = leaderboards[`${region}-${activeTypeTab}`] ?? [];

  return (
    <div className="min-h-dvh vn-gradient-bg">
      <div className="min-h-dvh">
        <div className="container mx-auto px-4 py-6 max-w-5xl">
          {/* Header */}
          <header className="flex flex-wrap justify-between items-center gap-3 mb-10">
            <Link href="/" className="text-2xl font-bold text-foreground tracking-wider">
              VNGeoGuessr
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {username && (
                <span className="text-muted-foreground text-sm hidden sm:inline">
                  Playing as <span className="font-semibold text-brand">{username}</span>
                </span>
              )}
              <Button
                onClick={handleLeaderboardClick}
                variant="outline"
              >
                <Trophy className="size-4" aria-hidden="true" />
                Leaderboard
              </Button>
              <Button
                onClick={() => setShowDonateModal(true)}
                variant="outline"
              >
                <span className="text-base leading-none" aria-hidden="true">🍺</span>
                Buy me a beer
              </Button>
            </div>
          </header>

          {/* Hero */}
          <div className="text-center mb-12 animate-fade-in-up">
            <h1 className="text-5xl sm:text-6xl font-extrabold text-foreground mb-3 tracking-tight">
              Guess the Location
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto">
              Explore Vietnamese streets and test your geography skills across iconic cities.
            </p>
          </div>

          <div className="grid lg:grid-cols-5 gap-6 max-w-5xl mx-auto">
            {/* How to Play */}
            <Card className="lg:col-span-2 bg-card border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl font-bold text-card-foreground">How to Play</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {STEP_LABELS.map((label, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-subtle text-brand-subtle-foreground flex items-center justify-center text-sm font-bold shrink-0">
                        {i + 1}
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed pt-1">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-border">
                  <p className="text-muted-foreground text-xs mb-2 uppercase tracking-wider font-medium">Scoring</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <span>0-50m = 5 pts</span>
                    <span>50-100m = 4 pts</span>
                    <span>100-200m = 3 pts</span>
                    <span>200-500m = 2 pts</span>
                    <span>500m-1km = 1 pt</span>
                    <span>1km+ = 0 pts</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Where to play */}
            <Card className="lg:col-span-3 bg-card border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl font-bold text-card-foreground text-center">Where to Play</CardTitle>
              </CardHeader>
              <CardContent>
                <RegionPicker />
              </CardContent>
            </Card>
          </div>
        </div>

        <DonateQRModal isOpen={showDonateModal} onClose={() => setShowDonateModal(false)} />
        <UsernameModal isOpen={showUsernameModal} onSubmit={handleUsernameSubmit} onClose={() => setShowUsernameModal(false)} />

        {/* Leaderboard Modal */}
        <Dialog open={showLeaderboardModal} onOpenChange={setShowLeaderboardModal}>
          <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl text-center font-bold">
                {region ? getRegion(region).name : 'Leaderboards'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <RegionSelect
                level={level}
                onLevelChange={setLevel}
                region={region}
                onRegionChange={setRegion}
              />

              <div className="flex gap-3">
                <div className="flex flex-col gap-2 min-w-[104px]">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">Type</div>
                  <div role="group" aria-label="Leaderboard type" className="flex flex-col overflow-hidden rounded-lg border border-border">
                    {['score', 'distance'].map((type, index) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setActiveTypeTab(type)}
                        aria-pressed={activeTypeTab === type}
                        className={`h-11 px-3 text-left text-sm font-semibold capitalize outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:-ring-offset-1 ${
                          index > 0 ? 'border-t border-border' : ''
                        } ${
                          activeTypeTab === type
                            ? 'bg-brand text-brand-foreground'
                            : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  {leaderboardError === `${region}-${activeTypeTab}` ? (
                    <div className="py-10 text-center" role="alert">
                      <p className="text-base text-foreground">Couldn&apos;t load this leaderboard</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        The scores are still there. Try again in a moment.
                      </p>
                    </div>
                  ) : (
                  <LeaderboardList
                    data={rows}
                    loading={loadingLeaderboard}
                    currentUsername={username}
                    type={activeTypeTab}
                  />
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Debug Button */}
        <Button
          asChild
          variant="outline"
          className="fixed bottom-6 right-6 size-12 rounded-full bg-card text-muted-foreground shadow-sm transition-colors duration-200 z-50"
        >
          <Link href="/debug" aria-label="Open debug tools" className="flex items-center justify-center">
            <Wrench className="size-5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
