"use client";

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Dynamically import components that need to run client-side only
const GameClient = dynamic(() => import('../components/GameClient'), { 
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white">Loading game...</p>
      </div>
    </div>
  )
});

export default function GamePage() {
  return <GameClient />;
}