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
import { SCORE_BANDS, formatDistance } from '../lib/game';

const STEP_LABELS = [
  'Choose a region: the whole country, a province, or one district',
  'View 360° street panorama',
  'Place your guess on the map',
  'Earn points based on accuracy!'
];

// Derived from the scoring ladder rather than re-typed: these are the
// district-round bands, and a hardcoded copy is how the table silently
// drifts from what the server actually awards. "1km" reads better than the
// "1.00km" a result badge shows, so round labels drop the trailing zeros.
const label = (meters) => formatDistance(meters).replace('.00km', 'km');
const SCORING_ROWS = [
  ...SCORE_BANDS.map((band, index) => {
    const from = index === 0 ? '0m' : label(SCORE_BANDS[index - 1].maxMeters);
    const pts = band.points === 1 ? '1 pt' : `${band.points} pts`;
    return `${from}-${label(band.maxMeters)} = ${pts}`;
  }),
  `${label(SCORE_BANDS[SCORE_BANDS.length - 1].maxMeters)}+ = 0 pts`,
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
                    {SCORING_ROWS.map((row) => (
                      <span key={row}>{row}</span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground/80">
                    Base scale — every region stretches these distances to
                    match its own size, from compact districts up to the
                    whole country.
                  </p>
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

          {/* Data attribution. mb clears the fixed build-stamp footer. */}
          <p className="mt-10 mb-8 text-center text-xs text-muted-foreground/80">
            Imagery ©{' '}
            <a href="https://www.mapillary.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
              Mapillary
            </a>{' '}
            (CC BY-SA 4.0) · Map data ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
              OpenStreetMap contributors
            </a>{' '}
            ·{' '}
            <Link href="/credits" className="underline underline-offset-2 hover:text-foreground">
              Credits
            </Link>
          </p>
        </div>

        <DonateQRModal isOpen={showDonateModal} onClose={() => setShowDonateModal(false)} />
        <UsernameModal isOpen={showUsernameModal} onSubmit={handleUsernameSubmit} onClose={() => setShowUsernameModal(false)} />

        {/* Debug Button. Safe-area offset keeps it clear of the home
            indicator; hover/active states give the press the feedback the
            bare outline variant lacked. z-40 keeps it under dialogs. */}
        <Button
          asChild
          variant="outline"
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-40 size-12 rounded-full bg-card text-muted-foreground shadow-sm transition-all duration-200 hover:border-brand/40 hover:text-foreground hover:shadow-md active:scale-95"
        >
          <Link
            href="/debug"
            aria-label="Open debug tools"
            title="Debug tools"
            className="flex items-center justify-center"
          >
            <Wrench className="size-5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
