"use client";

import Link from "next/link";
import { ArrowRight, Trophy, Wrench } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UsernameModal from './components/UsernameModal';
import DonateQRModal from './components/DonateQRModal';
import LeaderboardList from './components/LeaderboardList';
import { getUsername, setUsername, cities } from '../lib/game';

const STEP_LABELS = [
  'Choose your city',
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
  const [activeLocationTab, setActiveLocationTab] = useState('global');
  const [activeTypeTab, setActiveTypeTab] = useState('score');
  const [leaderboards, setLeaderboards] = useState({});
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

  const fetchAllLeaderboards = async () => {
    const currentFetchId = ++fetchIdRef.current;
    setLoadingLeaderboard(true);

    try {
      const keys = [
        { city: null, type: 'score' },
        { city: null, type: 'distance' },
        ...cities.flatMap(c => [
          { city: c.code, type: 'score' },
          { city: c.code, type: 'distance' }
        ])
      ];

      const results = await Promise.all(
        keys.map(async ({ city, type }) => {
          const params = new URLSearchParams();
          if (city) params.append('city', city);
          params.append('type', type);
          const response = await fetch(`/api/leaderboard?${params.toString()}`);
          const data = await response.json();
          const key = `${city || 'global'}-${type}`;
          return { key, data: data.success ? data.leaderboard : [] };
        })
      );

      if (currentFetchId !== fetchIdRef.current) return;

      const map = {};
      results.forEach(({ key, data }) => { map[key] = data; });
      setLeaderboards(map);
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setLoadingLeaderboard(false);
      }
    }
  };

  const handleLeaderboardClick = () => {
    setShowLeaderboardModal(true);
    fetchAllLeaderboards();
  };

  const getLeaderboardData = (locationKey, type) => {
    const key = `${locationKey}-${type}`;
    return leaderboards[key] || [];
  };

  const renderTabContent = (locationKey) => (
    <div className="flex gap-3">
      <div className="flex flex-col space-y-2 min-w-[100px]">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">Type</div>
        {['score', 'distance'].map(type => (
          <Button
            key={type}
            onClick={() => setActiveTypeTab(type)}
            variant={activeTypeTab === type ? 'default' : 'secondary'}
            aria-pressed={activeTypeTab === type}
            className={`min-h-11 justify-start capitalize ${
              activeTypeTab === type ? 'bg-brand text-brand-foreground hover:bg-brand-hover' : ''
            }`}
          >
            {type}
          </Button>
        ))}
      </div>
      <div className="flex-1">
        <LeaderboardList
          data={getLeaderboardData(locationKey, activeTypeTab)}
          loading={loadingLeaderboard}
          currentUsername={username}
          type={activeTypeTab}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh vn-gradient-bg">
      <div className="min-h-dvh">
        <div className="container mx-auto px-4 py-6 max-w-5xl">
          {/* Header */}
          <header className="flex justify-between items-center mb-10">
            <Link href="/" className="text-2xl font-bold text-foreground tracking-wider">
              VNGeoGuessr
            </Link>
            <div className="flex items-center gap-3">
              {username && (
                <span className="text-muted-foreground text-sm hidden sm:inline">
                  Playing as <span className="font-semibold text-brand">{username}</span>
                </span>
              )}
              <Button
                onClick={handleLeaderboardClick}
                variant="outline"
                className="min-h-11 transition-all"
              >
                <Trophy className="size-4" aria-hidden="true" />
                Leaderboard
              </Button>
              <Button
                onClick={() => setShowDonateModal(true)}
                className="min-h-11 bg-brand text-brand-foreground hover:bg-brand-hover transition-all"
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

            {/* City Selection */}
            <Card className="lg:col-span-3 bg-card border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl font-bold text-card-foreground text-center">Select a City</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {cities.map((city, i) => (
                    <Link
                      key={city.code}
                      href={`/game?location=${city.code}`}
                      className="city-card-accent flex min-h-14 items-center justify-between p-4 rounded-lg bg-muted/40 hover:bg-muted border border-border hover:border-brand/40 transition-colors duration-200 group focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="text-foreground font-semibold text-lg group-hover:text-brand transition-colors">
                        {city.name}
                      </span>
                      <ArrowRight
                        className="size-5 text-muted-foreground group-hover:text-brand transition-colors"
                        aria-hidden="true"
                      />
                    </Link>
                  ))}
                </div>
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
              <DialogTitle className="text-2xl text-center font-bold">Leaderboards</DialogTitle>
            </DialogHeader>
            <Tabs value={activeLocationTab} onValueChange={setActiveLocationTab} className="w-full">
              <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${cities.length + 1}, minmax(0, 1fr))` }}>
                <TabsTrigger value="global">Global</TabsTrigger>
                {cities.map(city => (
                  <TabsTrigger key={city.code} value={city.code}>{city.code}</TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="global" className="space-y-3 pt-2">
                {renderTabContent('global')}
              </TabsContent>
              {cities.map(city => (
                <TabsContent key={city.code} value={city.code} className="space-y-3 pt-2">
                  {renderTabContent(city.code)}
                </TabsContent>
              ))}
            </Tabs>
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
