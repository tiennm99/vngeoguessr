"use client";

import { ArrowLeft, Beer } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import SoundToggle from './SoundToggle';
import PlaceName from './PlaceName';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * The game screen's app bar: Back, what is being played, this visit's tally,
 * and the theme, sound and donate controls.
 *
 * Purely presentational -- every value arrives as a prop and every action is
 * a callback -- so the round lifecycle in GameClient owns no layout and this
 * owns no state. viewportFit:cover hands the layout the display cutout on
 * every axis, not just the top: in landscape the notch takes a 44-59px bite
 * out of one side, which is exactly where Back sits.
 * @param {Object} props
 * @param {Function} props.onBack Leave for the menu.
 * @param {Function} props.onDonate Open the donate dialog.
 * @param {boolean} props.daily True on the daily challenge.
 * @param {{number: number, streak: number}|null} props.dailyInfo Daily number and streak, once known.
 * @param {string} props.regionName The picked region, for a normal round.
 * @param {number} props.sessionRounds Rounds submitted this visit.
 * @param {number} props.sessionPoints Points earned this visit.
 */
export default function GameHeader({
  onBack,
  onDonate,
  daily,
  dailyInfo,
  regionName,
  sessionRounds,
  sessionPoints,
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 py-2 pl-[calc(0.75rem+env(safe-area-inset-left))] pr-[calc(0.75rem+env(safe-area-inset-right))] pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pl-[calc(1rem+env(safe-area-inset-left))] sm:pr-[calc(1rem+env(safe-area-inset-right))] bg-card border-b border-border shadow-sm">
      {/* Default size, not sm: the default is already the 44px touch target
          button.jsx promises, so nothing here has to patch a height back in. */}
      <Button
        onClick={onBack}
        variant="ghost"
        aria-label="Back to menu"
        className="text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Back</span>
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-foreground hidden sm:inline">VNGeoGuessr</span>
        {/* Truncates rather than pushing the controls off a 360px screen:
            a long district name loses its tail, not the mute button. */}
        <Badge variant="brand" className="max-w-[8rem] text-xs sm:max-w-none" title={daily ? "Today's daily challenge" : regionName}>
          {/* The ellipsis needs a block-level child: `truncate` on the
              inline-flex badge itself clips without one. */}
          <span className="truncate">
            {daily ? `Daily${dailyInfo ? ` #${dailyInfo.number}` : ''}` : <PlaceName>{regionName}</PlaceName>}
          </span>
        </Badge>
        {daily && dailyInfo?.streak > 0 && (
          <Badge variant="secondary" className="text-xs tabular-nums" title="Consecutive days played">
            <span aria-hidden="true">🔥</span> {dailyInfo.streak}
            <span className="sr-only">-day streak</span>
          </Badge>
        )}
        {/* This visit's tally; invisible until the first round lands so the
            header opens no colder than it used to, and hidden on phones,
            where the header has no spare width -- the result dialog carries
            the same numbers. */}
        {sessionRounds > 0 && (
          <Badge
            variant="secondary"
            className="hidden text-xs tabular-nums sm:inline-flex"
            title={`${sessionPoints} points in ${sessionRounds} ${sessionRounds === 1 ? 'round' : 'rounds'} this visit`}
          >
            {sessionRounds} {sessionRounds === 1 ? 'round' : 'rounds'} · {sessionPoints} pts
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Both toggles collapse to one cell below sm. Two full groups are
            seven 44px cells, which with Back, the region badge and the beer
            button is more than a 360px header holds; the overflow used to
            clip the right-hand controls out of reach after the first round.
            The breakpoint class goes on a wrapper, not on the control: the
            control's own class list already sets inline-flex, and `hidden`
            fights it for the same property -- whichever Tailwind emits last
            wins, which is how both variants ended up visible at once. A
            wrapper that is display:none also takes its child out of the
            accessibility tree, so nothing is announced twice. Both copies
            read the same store, so they never disagree. */}
        <span className="sm:hidden">
          <ThemeToggle compact />
        </span>
        <span className="hidden sm:inline">
          <ThemeToggle />
        </span>
        <span className="sm:hidden">
          <SoundToggle compact />
        </span>
        <span className="hidden sm:inline">
          <SoundToggle />
        </span>
        <Button
          onClick={onDonate}
          variant="ghost"
          aria-label="Buy me a beer"
          className="text-muted-foreground hover:text-foreground"
        >
          <Beer className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Buy me a beer</span>
        </Button>
      </div>
    </header>
  );
}
