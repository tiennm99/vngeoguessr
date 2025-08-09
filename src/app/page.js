"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UsernameModal from './components/UsernameModal';
import { getUsername, setUsername } from '../lib/game';

const cities = [
  { code: 'HN', name: 'HA NOI' },
  { code: 'TPHCM', name: 'TP. HO CHI MINH' },
  { code: 'HP', name: 'HAI PHONG' },
  { code: 'ND', name: 'NAM DINH' },
  { code: 'DN', name: 'DA NANG' },
  { code: 'DL', name: 'DA LAT' },
];

export default function Home() {
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [username, setUsernameState] = useState('');

  useEffect(() => {
    // Check for existing username on page load
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

  const handleUsernameSkip = () => {
    setShowUsernameModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600">
      <div className="min-h-screen bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <header className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <Button asChild className="bg-purple-600 hover:bg-purple-700 transition-all duration-200 transform hover:scale-105">
                <Link href="/leaderboard" className="flex items-center gap-2">
                  <span>🏆</span>
                  <span className="font-semibold">LEADERBOARD</span>
                </Link>
              </Button>
              <Button asChild className="bg-gray-600 hover:bg-gray-700 transition-all duration-200 transform hover:scale-105">
                <Link href="/debug" className="flex items-center gap-2">
                  <span>🔧</span>
                  <span className="font-semibold">DEBUG</span>
                </Link>
              </Button>
              <Button
                onClick={() => setShowDonateModal(true)}
                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black transition-all duration-200 transform hover:scale-105"
              >
                <span>☕</span>
                <span className="font-semibold">BUY ME COFFEE</span>
              </Button>
            </div>
          </header>

          {/* Main Content */}
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">WELCOME TO VIET NAM GUESSR GAME</h2>
            <div className="flex items-center justify-center gap-4 mb-8">
              <span className="text-2xl">💎</span>
              <span className="text-2xl">💎</span>
              <h3 className="text-3xl font-bold text-yellow-300">PLAY NOW</h3>
              <span className="text-2xl">💎</span>
              <span className="text-2xl">💎</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Left Panel - Instructions */}
            <Card className="bg-white/10 backdrop-blur-md border-white/20">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-white">HOW TO PLAY</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-white">
                  <p className="text-lg">1. Choose your city</p>
                  <p className="text-lg">2. View the street-level panoramic image</p>
                  <p className="text-lg">3. Guess the location on the map as accurately as possible</p>
                  <p className="text-lg">4. Earn points based on your accuracy!</p>
                </div>
              </CardContent>
            </Card>

            {/* Right Panel - City Selection */}
            <Card className="bg-white/10 backdrop-blur-md border-white/20">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-white text-center">SELECT CITY</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {cities.map((city) => (
                    <Button
                      key={city.code}
                      asChild
                      className="w-full font-bold py-3 px-6 transition-all duration-200 transform hover:scale-105"
                      size="lg"
                    >
                      <Link href={`/game?location=${city.code}`}>
                        {city.name}
                      </Link>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Donate Modal */}
        <Dialog open={showDonateModal} onOpenChange={setShowDonateModal}>
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
                onClick={() => setShowDonateModal(false)}
                className="px-6"
              >
                CLOSE
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Username Modal */}
        <UsernameModal 
          isOpen={showUsernameModal}
          onSubmit={handleUsernameSubmit}
          onClose={handleUsernameSkip}
        />
      </div>
    </div>
  );
}
