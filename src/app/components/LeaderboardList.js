"use client";

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistance, getDistanceColor } from '../../lib/game';

function getScoreColor(score) {
  if (score >= 50) return 'text-purple-600';
  if (score >= 25) return 'text-green-600';
  if (score >= 15) return 'text-blue-600';
  if (score >= 10) return 'text-yellow-600';
  if (score >= 5) return 'text-orange-600';
  return 'text-red-600';
}

function getRankIcon(rank) {
  switch (rank) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return `#${rank}`;
  }
}

export default function LeaderboardList({ data, loading, currentUsername, type }) {
  const isDistance = type === 'distance';

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-100">
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-10" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-500 text-base">No {isDistance ? 'records' : 'scores'} yet!</p>
        <p className="text-gray-400 text-sm mt-1">Be the first to play!</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {data.map((entry) => {
        const isUser = currentUsername && entry.username === currentUsername;
        const key = isDistance ? `${entry.username}-${entry.timestamp}` : entry.username;

        return (
          <div
            key={key}
            className={`flex items-center justify-between p-3 rounded-lg transition-all ${
              isUser
                ? 'bg-amber-50 border-2 border-amber-400 shadow-md'
                : entry.rank <= 3
                  ? 'bg-red-50/50 border border-red-100'
                  : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="text-lg font-bold w-10 text-center">
                {getRankIcon(entry.rank)}
              </div>
              <div>
                <div className={`font-semibold ${isUser ? 'text-amber-800' : 'text-gray-800'}`}>
                  {entry.username}
                  {isUser && (
                    <Badge className="ml-2 bg-amber-500 text-white text-xs">YOU</Badge>
                  )}
                </div>
                {isDistance && entry.timestamp && (
                  <div className="text-xs text-gray-400">
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
            <Badge variant="secondary" className={`text-lg font-bold ${
              isDistance ? getDistanceColor(entry.distance) : getScoreColor(entry.score)
            }`}>
              {isDistance ? formatDistance(entry.distance) : entry.score}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
