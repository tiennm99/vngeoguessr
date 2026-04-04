"use client";

import { Suspense } from 'react';
import GameClient from '../components/GameClient';

function GameLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center vn-gradient-bg">
      <div className="text-center space-y-4 animate-fade-in-up">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-red-600 rounded-full animate-spin mx-auto" />
        <p className="text-gray-700 text-lg font-medium">Loading game...</p>
      </div>
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<GameLoadingFallback />}>
      <GameClient />
    </Suspense>
  );
}
