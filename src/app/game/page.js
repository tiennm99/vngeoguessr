"use client";

import { Suspense } from 'react';
import GameClient from '../components/GameClient';

function GameLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center vn-surface">
      <div role="status" aria-live="polite" className="text-center space-y-4 animate-fade-in-up">
        <div className="w-12 h-12 border-4 border-border border-t-brand rounded-full animate-spin mx-auto" aria-hidden="true" />
        <p className="text-foreground text-lg font-medium">Loading game...</p>
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
