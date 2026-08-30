"use client";

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDistance } from '../../lib/game';
import { useCountUp } from '../../lib/use-count-up';
import ResultMap from './ResultMap';

const getScoreBg = (s) => {
  if (s >= 5) return 'bg-green-600';
  if (s >= 4) return 'bg-emerald-600';
  if (s >= 3) return 'bg-amber-600';
  if (s >= 2) return 'bg-orange-600';
  if (s >= 1) return 'bg-red-500';
  return 'bg-neutral-500';
};

// Colour alone must not carry the result; every band also gets a word.
const getScoreLabel = (s) => {
  if (s >= 5) return 'Pinpoint';
  if (s >= 4) return 'Excellent';
  if (s >= 3) return 'Good';
  if (s >= 2) return 'Fair';
  if (s >= 1) return 'Far';
  return 'Missed';
};

// Get result message based on score
const getResultMessage = (score) => {
  if (score > 4) return "Excellent! Outstanding guess!";
  if (score > 2) return "Good job! Nice work!";
  if (score > 0) return "Not bad! Keep trying!";
  return "Nice try! Better luck next time!";
};

// The end-of-round reveal. `result` is null until a round has been submitted;
// `result.failed` marks a round the server never recorded, which is presented
// as exactly that rather than as a zero-point miss.
export default function RoundResultDialog({
  open,
  onOpenChange,
  result,
  guessCoordinates,
  username,
  regionName,
  onNextRound,
  onMenu,
}) {
  const score = result?.score ?? 0;

  // The result is the payoff of a round, so the score lands by counting up
  // rather than arriving already finished.
  const shownScore = useCountUp(score, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
        key={open ? 'open' : 'closed'}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold">
            {result?.failed ? 'Round Not Recorded' : 'Round Result'}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body: everything between the title and the actions. */}
        <div className="overflow-y-auto -mx-1 px-1 space-y-4">
          {result?.failed ? (
            // A failed submission is not a zero-point round. Showing the
            // score circle here would present a write failure as a real miss,
            // and the player would have no way to tell the difference.
            <div className="space-y-3 py-6 text-center" role="alert">
              <p className="text-lg font-semibold text-foreground">
                Your guess could not be saved
              </p>
              <p className="text-sm text-muted-foreground">
                Nothing was scored. The round has ended, so start a new one to try again.
              </p>
            </div>
          ) : result ? (
            <>
              <div className="text-center space-y-4 animate-fade-in-up" role="status" aria-live="polite">
                {/* Score circle */}
                <div className="flex flex-col items-center gap-2 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
                  <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-white text-3xl font-extrabold tabular-nums shadow-md ring-4 ring-background ${getScoreBg(score)}`}>
                    {shownScore}
                  </div>
                  <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {getScoreLabel(score)}
                  </span>
                </div>

                <div className="animate-fade-in-up" style={{ animationDelay: '240ms' }}>
                  <Badge variant="secondary" className="text-lg font-semibold px-3 py-1 tabular-nums">
                    {formatDistance(result.distance)} away
                  </Badge>
                </div>

                <p className="text-muted-foreground text-sm animate-fade-in-up" style={{ animationDelay: '320ms' }}>
                  {getResultMessage(score)}
                </p>

                {/* Where the panorama actually was. The reveal: for a province or
                    country round the player did not know this until now. */}
                {result.resolvedPath && (
                  <p className="text-sm text-muted-foreground">
                    {result.resolvedPath.join(' › ')}
                  </p>
                )}

                {/* One row per level the guess credited. A district round shows
                    three; a round whose panorama fell outside every district
                    shows two. */}
                {result.scoreLevels.length > 0 && (
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    {result.scoreLevels.map((entry) => (
                      <div
                        key={entry.code}
                        className="rounded-lg bg-brand-subtle p-2 text-brand-subtle-foreground"
                      >
                        <p className="font-semibold">{entry.name}</p>
                        <p className="tabular-nums">
                          {entry.score === null ? 'Below top 200' : `Total: ${entry.score}`}
                        </p>
                        {entry.rank && (
                          <p className="text-xs tabular-nums opacity-80">Rank #{entry.rank}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {result.distanceLevels.some((entry) => entry.rank) && (
                  <div className="grid gap-2 text-xs sm:grid-cols-3">
                    {result.distanceLevels
                      .filter((entry) => entry.rank)
                      .map((entry) => (
                        <div key={entry.code} className="rounded-lg bg-muted p-2">
                          <p className="font-medium text-foreground">{entry.name} distance</p>
                          <p className="tabular-nums text-muted-foreground">Rank #{entry.rank}</p>
                        </div>
                      ))}
                  </div>
                )}

                {result.leaderboardMessage && (
                  <p className="text-sm text-green-700 dark:text-green-400 font-medium">{result.leaderboardMessage}</p>
                )}

                <p className="text-xs text-muted-foreground">
                  {username || 'Anonymous'} • {regionName}
                </p>
              </div>

              <ResultMap
                guessCoordinates={guessCoordinates}
                exactLocation={result.exactLocation}
              />
            </>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button onClick={onNextRound} size="lg" className="flex-[2]">
            Next Round
          </Button>
          <Button onClick={onMenu} variant="ghost" className="flex-1">
            Menu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
