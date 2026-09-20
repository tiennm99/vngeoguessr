"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calendar, Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { dailyDay, dailyNumber } from '../../lib/daily-calendar';
import { getDailyProgress, currentStreak } from '../../lib/daily-progress';
import { buildDailyShareText, shareText } from '../../lib/share';
import { formatDistance } from '../../lib/game';

const MAX_POINTS = 5;

/**
 * The home page's door to today's daily challenge.
 *
 * Reads the browser's record after mount, so the first paint matches the
 * server's (no record) and corrects itself: played today shows the score and
 * a share button, otherwise a Play row. The streak shows while it is alive.
 * @param {Object} props
 * @param {Function} props.onPlayClick Same interception hook as the region rows.
 */
export default function DailyCard({ onPlayClick }) {
  const [state, setState] = useState(null);
  const [shareState, setShareState] = useState(null);

  useEffect(() => {
    const today = dailyDay();
    const progress = getDailyProgress();
    setState({
      today,
      number: dailyNumber(today),
      streak: currentStreak(progress, today),
      played: progress?.day === today ? progress : null,
    });
  }, []);

  const number = state?.number ?? dailyNumber(dailyDay());
  const played = state?.played ?? null;
  const streak = state?.streak ?? 0;

  const handleShare = async () => {
    const outcome = await shareText(
      buildDailyShareText(
        played.number,
        played.result.score,
        formatDistance(played.result.distance),
        played.streak,
        `${window.location.origin}/daily`
      )
    );
    setShareState(outcome);
  };

  const squares = played
    ? '🟩'.repeat(played.result.score) + '⬜'.repeat(MAX_POINTS - played.result.score)
    : '';

  return (
    <Card className="city-card-accent border-border bg-card shadow-sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand-subtle-foreground">
            <Calendar className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-foreground">
              Daily Challenge #{number}
              {streak > 0 && (
                <span className="ml-2 text-sm font-medium text-muted-foreground" title="Consecutive days played">
                  🔥 {streak}
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {played
                ? `Played today: ${squares} ${played.result.score}/${MAX_POINTS} · ${formatDistance(played.result.distance)} away`
                : 'One street view, the same for everyone. New at midnight, Vietnam time.'}
            </p>
          </div>
        </div>

        {played ? (
          <div className="flex items-center gap-2">
            <Button onClick={handleShare} variant="outline" size="sm" aria-label="Share today's result">
              {shareState === 'copied' ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
              {shareState === 'copied' ? 'Copied' : 'Share'}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/daily">See result</Link>
            </Button>
          </div>
        ) : (
          <Link
            href="/daily"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              if (onPlayClick && onPlayClick('/daily')) e.preventDefault();
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Play today&apos;s
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
