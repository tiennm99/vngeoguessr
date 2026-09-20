"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, ChevronDown, ExternalLink, Share2 } from 'lucide-react';
import { formatDistance, SCORE_BANDS } from '../../lib/game';
import { useCountUp } from '../../lib/use-count-up';
import { regionSlug } from '../../lib/regions';
import { buildShareText, buildDailyShareText, shareText } from '../../lib/share';
import ResultMap, { MARKER_COLORS } from './ResultMap';

// Why a round was not recorded, in the player's terms. The server names the
// reason; without one, the honest default is that the write failed.
const FAILURE_COPY = {
  'session-expired': {
    title: 'This round expired',
    body: 'Rounds last 30 minutes. Nothing was scored, so start a new one.',
  },
  'session-consumed': {
    title: 'This round was already submitted',
    body: 'Only the first guess counts. Nothing more was scored.',
  },
  default: {
    title: 'Your guess could not be saved',
    body: 'Nothing was scored. The round has ended, so start a new one to try again.',
  },
};

// The one line the ladder cannot say: how much of the answer's region a miss
// still got right. Only worth showing when the ladder itself said little.
const HIT_COPY = {
  district: 'Right district',
  province: 'Right province, wrong district',
  none: 'Wrong province',
};

// Background and text move together: the semantic tokens flip to lighter
// fills with dark text in dark mode, so a hardcoded text-white cannot ride
// along on the wrapper.
const getScoreClasses = (s) => {
  if (s >= 4) return 'bg-success text-success-foreground';
  if (s >= 2) return 'bg-warning text-warning-foreground';
  if (s >= 1) return 'bg-danger text-danger-foreground';
  return 'bg-muted-foreground text-background';
};

// Colour alone must not carry the result; every band also gets a word, and the
// message below the map is derived from the same band so the two never
// disagree about how good the round was.
const SCORE_WORDING = [
  { label: 'Missed', message: 'Nice try! Better luck next time!' },
  { label: 'Far', message: 'Quite far — keep trying!' },
  { label: 'Fair', message: 'Fair guess — getting closer!' },
  { label: 'Good', message: 'Good job! Nice work!' },
  { label: 'Excellent', message: 'Excellent! Almost spot on!' },
  { label: 'Pinpoint', message: 'Outstanding! Pinpoint accuracy!' },
];

const scoreWording = (score) => {
  const index = Math.min(Math.max(Math.trunc(score), 0), SCORE_WORDING.length - 1);
  return SCORE_WORDING[index];
};

// A tiny uppercase caption; every grouped block in this dialog gets one so no
// number appears without a name.
function SectionCaption({ children }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

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
  regionCode,
  daily,
  onNextRound,
  onMenu,
}) {
  const score = result?.score ?? 0;

  // The result is the payoff of a round, so the score lands by counting up
  // rather than arriving already finished.
  const shownScore = useCountUp(score, open);

  // The share outcome ('shared' | 'copied' | 'failed'), remembered against
  // the result it belongs to, so a new round's dialog opens with a fresh
  // button without an effect resetting state on open.
  const [shareOutcome, setShareOutcome] = useState({ result: null, state: null });
  const shareState = shareOutcome.result === result ? shareOutcome.state : null;

  const handleShare = async () => {
    const distance = formatDistance(result.distance);
    const text = daily
      ? buildDailyShareText(daily.number, score, distance, daily.streak, `${window.location.origin}/daily`)
      : buildShareText(regionName, score, distance, `${window.location.origin}/game/${regionSlug(regionCode)}`);
    setShareOutcome({ result, state: await shareText(text) });
  };

  const failure = FAILURE_COPY[result?.reason] ?? FAILURE_COPY.default;
  // A guess the ladder scored well already says where it landed; the region
  // line earns its place under 3 points, where the ladder says only "beyond".
  const hitLine = result && !result.failed && score < 3 && result.hit ? HIT_COPY[result.hit] : null;

  const hasScoreLevels = (result?.scoreLevels?.length ?? 0) > 0;
  const hasDistanceLevels = result?.distanceLevels?.some((entry) => entry.rank) ?? false;
  const hasLeaderboardSection = hasScoreLevels || hasDistanceLevels;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* svh, not dvh: the dialog is centred with a translate, so a viewport
          unit that over-reports the visible area (Safari does while its
          toolbars are on screen) hides Next Round below the fold instead of
          just cropping the bottom. svh is never larger than what is visible. */}
      <DialogContent
        className="sm:max-w-xl max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
        key={open ? 'open' : 'closed'}
        // The round's session was consumed on submit, so closing this dialog
        // would strand the player in a dead round whose re-submit reads as
        // "Round Not Recorded". No X, and Esc/overlay are no-ops upstream: the
        // only ways forward are Next Round and Menu.
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold">
            {result?.failed ? 'Round Not Recorded' : daily ? `Daily #${daily.number}` : 'Round Result'}
          </DialogTitle>
          {/* Carries the round outcome so screen readers hear it once via
              aria-describedby when the dialog opens -- a live region would
              race the dialog mount, and the visual count-up must not be
              announced frame by frame. */}
          <DialogDescription className="sr-only">
            {result?.failed
              ? 'The guess could not be saved and nothing was scored.'
              : result && Number.isFinite(result.distance)
                ? `Scored ${score} of 5 points, ${formatDistance(result.distance)} away.`
                : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body: everything between the title and the actions.
            Order is the payoff order -- score, distance, the map, the reveal
            -- with the leaderboard bookkeeping collapsed below them so the
            whole story fits one phone viewport. */}
        <div className="overflow-y-auto -mx-1 px-1 space-y-4">
          {result?.failed ? (
            // A failed submission is not a zero-point round. Showing the
            // score circle here would present a write failure as a real miss,
            // and the player would have no way to tell the difference.
            <div className="space-y-3 py-6 text-center" role="alert">
              <p className="text-lg font-semibold text-foreground">{failure.title}</p>
              <p className="text-sm text-muted-foreground">{failure.body}</p>
            </div>
          ) : result ? (
            <>
              <div className="text-center space-y-4 animate-fade-in-up">
                {/* Score circle */}
                <div className="flex flex-col items-center gap-2 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
                  <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-3xl font-extrabold tabular-nums shadow-md ring-4 ring-background ${getScoreClasses(score)}`}>
                    {shownScore}
                  </div>
                  <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {scoreWording(score).label}
                  </span>
                </div>

                <div className="animate-fade-in-up" style={{ animationDelay: '240ms' }}>
                  <Badge variant="secondary" className="text-lg font-semibold px-3 py-1 tabular-nums">
                    {formatDistance(result.distance)} away
                  </Badge>
                </div>

                <p className="text-muted-foreground text-sm animate-fade-in-up" style={{ animationDelay: '320ms' }}>
                  {scoreWording(score).message}
                </p>
                {hitLine && (
                  <p className="text-sm font-medium text-foreground animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                    {hitLine}
                  </p>
                )}
                {daily && (
                  <p className="text-sm text-muted-foreground animate-fade-in-up" style={{ animationDelay: '460ms' }}>
                    {daily.streak > 1
                      ? `🔥 ${daily.streak}-day streak. A new challenge lands at midnight, Vietnam time.`
                      : 'Same place for everyone today. A new challenge lands at midnight, Vietnam time.'}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <ResultMap
                  guessCoordinates={guessCoordinates}
                  exactLocation={result.exactLocation}
                />
                {/* The two dots on the map, named. Colour is not enough: the
                    pair must survive red-green colour blindness and the map's
                    own palette. */}
                <p className="flex justify-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full ring-1 ring-white"
                      style={{ backgroundColor: MARKER_COLORS.guess }}
                      aria-hidden="true"
                    />
                    Your guess
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full ring-1 ring-white"
                      style={{ backgroundColor: MARKER_COLORS.actual }}
                      aria-hidden="true"
                    />
                    Actual location
                  </span>
                </p>
              </div>

              {/* Where the panorama actually was. The reveal: for a province or
                  country round the player did not know this until now. */}
              {result.resolvedPath && (
                <div className="text-center space-y-0.5">
                  <SectionCaption>It was in</SectionCaption>
                  <p className="text-sm font-semibold text-foreground">
                    {result.resolvedPath.join(' › ')}
                  </p>
                  {/* The answer is out, so the spot can be explored. Only
                      here, after the guess: the same link before it would be
                      the answer. */}
                  {result.exactLocation && (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${result.exactLocation.lat}&mlon=${result.exactLocation.lng}#map=17/${result.exactLocation.lat}/${result.exactLocation.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Explore this spot on OpenStreetMap
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}

              {hasLeaderboardSection && (
                <details className="group rounded-lg border border-border">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    Leaderboard results
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="space-y-4 px-3 pb-3 text-center">
                    {/* The scoring ladder, identical for every region, so
                        "how close did I need to be?" has one answer the player
                        can carry into the next round. */}
                    <div className="space-y-1.5">
                      <SectionCaption>Scoring ladder</SectionCaption>
                      <div className="flex flex-wrap justify-center gap-1.5 text-xs">
                        {SCORE_BANDS.map((band) => (
                          <span
                            key={band.points}
                            className={`rounded-md px-2 py-1 tabular-nums ${
                              band.points === score
                                ? 'bg-brand text-brand-foreground font-semibold'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {`≤${formatDistance(band.maxMeters)} = ${band.points}`}
                          </span>
                        ))}
                        <span
                          className={`rounded-md px-2 py-1 tabular-nums ${
                            score === 0
                              ? 'bg-brand text-brand-foreground font-semibold'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          beyond = 0
                        </span>
                      </div>
                    </div>

                    {/* One row per level the guess credited. A district round
                        shows three; a round whose panorama fell outside every
                        district shows two. */}
                    {hasScoreLevels && (
                      <div className="space-y-1.5">
                        <SectionCaption>Leaderboard points added</SectionCaption>
                        <div className="grid gap-2 text-sm sm:grid-cols-3">
                          {result.scoreLevels.map((entry) => (
                            <div
                              key={entry.code}
                              className="rounded-lg bg-brand-subtle p-2 text-brand-subtle-foreground"
                            >
                              <p className="font-semibold">{entry.name}</p>
                              <p className="tabular-nums">
                                {`Total: ${entry.score}`}
                                {typeof entry.points === 'number' ? ` (+${entry.points})` : ''}
                              </p>
                              {entry.rank && (
                                <p className="text-xs tabular-nums opacity-80">Rank #{entry.rank}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {hasDistanceLevels && (
                      <div className="space-y-1.5">
                        <SectionCaption>Best-distance ranks</SectionCaption>
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
                      </div>
                    )}

                    {result.leaderboardMessage && (
                      <p className="text-sm text-success font-medium">{result.leaderboardMessage}</p>
                    )}
                  </div>
                </details>
              )}

              <p className="text-center text-xs text-muted-foreground">
                {username || 'Anonymous'} • {regionName}
              </p>
            </>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button onClick={onNextRound} size="lg" className="flex-[2]">
            {daily ? 'Done' : 'Next Round'}
          </Button>
          {result && !result.failed && (
            <Button
              onClick={handleShare}
              variant="outline"
              size="lg"
              aria-label={shareState === 'copied' ? 'Result copied' : 'Share this result'}
              title="Share this result"
              className="px-3"
            >
              {shareState === 'copied' ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Share2 className="size-4" aria-hidden="true" />
              )}
              <span className="sr-only sm:not-sr-only">
                {shareState === 'copied' ? 'Copied' : shareState === 'failed' ? 'Retry' : 'Share'}
              </span>
            </Button>
          )}
          {!daily && (
            <Button onClick={onMenu} variant="ghost" className="flex-1">
              Menu
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
