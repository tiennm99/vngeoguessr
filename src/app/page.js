"use client";

import Link from "next/link";
import { Wrench } from "lucide-react";
import React, { useState, useEffect } from "react";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ThemeToggle from './components/ThemeToggle';
import UsernameModal from './components/UsernameModal';
import DonateQRModal from './components/DonateQRModal';
import LeaderboardModal from './components/LeaderboardModal';
import RegionPicker from './components/RegionPicker';
import { getUsername, setUsername } from '../lib/username';

const STEP_LABELS = [
  'Choose a region: the whole country, a province, or one district',
  'View 360° street panorama',
  'Place your guess on the map',
  'Earn points based on accuracy!'
];

export default function Home() {
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [username, setUsernameState] = useState('');

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
              <LeaderboardModal currentUsername={username} />
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
