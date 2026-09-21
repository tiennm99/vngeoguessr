"use client";

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Calendar, Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { dailyDay, dailyNumber } from '../../lib/daily-calendar';
import { getDailyProgress, watchDailyProgress, currentStreak } from '../../lib/daily-progress';
import { useStoredValue } from '../../lib/use-stored-value';
import { buildDailyShareText, shareText } from '../../lib/share';
import { formatDistance } from '../../lib/game';

const MAX_POINTS = 5;

// The day never changes under an open page in a way worth subscribing to; a
// reload at midnight is the refresh.
const subscribeNothing = () => () => {};

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
  const [shareState, setShareState] = useState(null);

  // Today's day is browser-only knowledge: the page is prerendered, and a day
  // computed at build time would be frozen into the HTML and disagree with
  // the client on every later day. Read through the same store hook as the
  // record, with null as the server value, so nothing dated renders until
  // the browser says what day it is.
  const today = useStoredValue(dailyDay, subscribeNothing, null);
  const progress = useStoredValue(getDailyProgress, watchDailyProgress, null);

  const number = today ? dailyNumber(today) : null;
  const played = today && progress?.day === today ? progress : null;
  const streak = today ? currentStreak(progress, today) : 0;
  const shareLabel = shareState === 'copied' ? 'Copied' : shareState === 'failed' ? 'Retry' : 'Share';
  const ShareIcon = shareState === 'copied' ? Check : shareState === 'failed' ? AlertCircle : Share2;
  const shareStatus =
    shareState === 'copied' ? 'Copied to the clipboard.'
      : shareState === 'shared' ? 'Shared.'
        : shareState === 'failed' ? 'Sharing failed. Try again.'
          : '';

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
              Daily Challenge{number ? ` #${number}` : ''}
              {streak > 0 && (
                <span className="ml-2 text-sm font-medium text-muted-foreground" title="Consecutive days played">
                  <span aria-hidden="true">🔥</span> {streak}
                  <span className="sr-only">-day streak</span>
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {played
                ? `Played today: ${squares} ${played.result.score}/${MAX_POINTS} · ${formatDistance(played.result.distance)} away`
                : 'One street view, one guess, the same for everyone. New at midnight, Vietnam time.'}
            </p>
          </div>
        </div>

        {played ? (
          <div className="flex items-center gap-2">
            <Button onClick={handleShare} variant="outline" title="Share today's result">
              <ShareIcon className="size-4" aria-hidden="true" />
              {shareLabel}
            </Button>
            <Button asChild variant="ghost">
              <Link href="/daily">See result</Link>
            </Button>
            <p role="status" aria-live="polite" className="sr-only">{shareStatus}</p>
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
            Play today&apos;s challenge
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
