"use client";

import { Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistance, getDistanceColor } from '../../lib/game';

function getScoreColor(score) {
  if (score >= 50) return 'text-purple-700 dark:text-purple-300';
  if (score >= 25) return 'text-green-700 dark:text-green-300';
  if (score >= 15) return 'text-blue-700 dark:text-blue-300';
  if (score >= 10) return 'text-yellow-700 dark:text-yellow-300';
  if (score >= 5) return 'text-orange-700 dark:text-orange-300';
  return 'text-red-700 dark:text-red-300';
}

// Medal tint for the podium. The rank number stays visible alongside it, so the
// placing never depends on reading the colour or an emoji glyph.
function getMedalClass(rank) {
  switch (rank) {
    case 1: return 'text-amber-500';
    case 2: return 'text-slate-400';
    case 3: return 'text-orange-700 dark:text-orange-400';
    default: return '';
  }
}

export default function LeaderboardList({ data, loading, currentUsername, type }) {
  const isDistance = type === 'distance';

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted">
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
        <p className="text-foreground text-base">No {isDistance ? 'records' : 'scores'} yet!</p>
        <p className="text-muted-foreground text-sm mt-1">Be the first to play!</p>
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
                ? 'bg-amber-100/70 dark:bg-amber-950/40 border-2 border-amber-500 shadow-md'
                : entry.rank <= 3
                  ? 'bg-brand-subtle/40 border border-brand/20'
                  : 'bg-muted/50 hover:bg-muted'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 w-14 shrink-0">
                {entry.rank <= 3 && (
                  <Medal className={`size-4 shrink-0 ${getMedalClass(entry.rank)}`} aria-hidden="true" />
                )}
                <span className="text-base font-bold tabular-nums">#{entry.rank}</span>
              </div>
              <div>
                <div className={`font-semibold ${isUser ? 'text-amber-900 dark:text-amber-200' : 'text-foreground'}`}>
                  {entry.username}
                  {isUser && (
                    <Badge className="ml-2 bg-amber-700 text-white text-xs">YOU</Badge>
                  )}
                </div>
                {isDistance && entry.timestamp && (
                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
            <Badge variant="secondary" className={`text-lg font-bold tabular-nums ${
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
