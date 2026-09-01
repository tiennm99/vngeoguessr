"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getLastRegion } from '../../lib/last-region';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  COUNTRY_CODE,
  childrenOf,
  coverageOf,
  getRegion,
  isPlayable,
  isRegion,
  isThin,
  isUnresolved,
  provinces,
} from '../../lib/regions';

/** Thousands separators, so 225,966 reads as a quantity rather than a code. */
const count = (value) => value.toLocaleString('en-US');

/**
 * Why a region cannot be played, in the player's terms.
 *
 * The three causes are genuinely different and a maintainer needs to tell them
 * apart -- see the Coverage note in docs/project-overview.md -- but a player
 * only needs to know it is not their fault and not a bug.
 * @param {string} code Region code.
 * @returns {string} Short label.
 */
function unavailableLabel(code) {
  return isUnresolved(code) ? 'no map data' : 'no street view';
}

/**
 * One playable row: the region name, how much of it there is, and a link.
 * @param {Object} props
 * @param {string} props.code Region code.
 * @param {string} props.label Text to show.
 * @param {boolean} props.emphasis True to style as the primary action.
 * @param {Function} props.onPlayClick Pre-navigation hook; returning true
 *   cancels the navigation (the caller resumes it itself).
 */
function PlayRow({ code, label, emphasis, onPlayClick }) {
  const { panos } = coverageOf(code);
  const href = `/game?region=${code}`;

  return (
    <Link
      href={href}
      onClick={(e) => {
        // Modified clicks (new tab, new window) keep native behavior: the
        // deep-linked game page can name the player itself, so hijacking the
        // gesture would cost more than the prompt is worth.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (onPlayClick && onPlayClick(href)) e.preventDefault();
      }}
      className={`group flex min-h-14 items-center justify-between gap-3 rounded-xl border p-4 shadow-xs transition-all duration-150 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        emphasis ? 'city-card-accent border-border bg-card' : 'border-border/60 bg-card/60'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="font-semibold text-foreground transition-colors group-hover:text-brand">
          {label}
        </span>
        {isThin(code) && (
          <span
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            title="Limited street imagery — repeats are likely"
          >
            few streets
          </span>
        )}
      </span>
      <span className="flex items-center gap-3">
        <span
          className="text-xs tabular-nums text-muted-foreground"
          title={`${count(panos)} street panoramas to guess from`}
        >
          {count(panos)} spots
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-subtle px-3 py-1.5 text-sm font-semibold text-brand-subtle-foreground transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
          Play
          <ArrowRight className="size-4" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

/**
 * A region with no coverage. Listed, not hidden: the tree is honest about what
 * exists, and a missing district is more confusing than a disabled one.
 * @param {Object} props
 * @param {string} props.code Region code.
 */
function UnavailableRow({ code }) {
  return (
    <div
      className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-dashed border-border/60 p-4 opacity-60"
    >
      <span className="font-medium text-muted-foreground">{getRegion(code).name}</span>
      <span className="text-xs text-muted-foreground">{unavailableLabel(code)}</span>
    </div>
  );
}

/**
 * Choose where to play: the whole country, a province, or one district.
 *
 * The province row itself plays that province, and only the chevron expands it,
 * so the common case stays one click while 61 districts stay reachable.
 */
export default function RegionPicker({ onPlayClick }) {
  // Read in an effect, not during render: localStorage does not exist on the
  // server and a hydration mismatch is worse than the row appearing a frame
  // late. Only one row keeps the accent style -- two competing primary
  // actions is worse than none -- so this renders un-emphasised.
  const [lastRegion, setLastRegionState] = useState(null);

  useEffect(() => {
    const code = getLastRegion();
    if (code && code !== COUNTRY_CODE && isRegion(code) && isPlayable(code)) {
      setLastRegionState(code);
    }
  }, []);

  return (
    <div className="grid gap-3">
      <PlayRow code={COUNTRY_CODE} label="Play anywhere in Vietnam" emphasis onPlayClick={onPlayClick} />

      {lastRegion && (
        <PlayRow code={lastRegion} label={`Continue in ${getRegion(lastRegion).name}`} onPlayClick={onPlayClick} />
      )}

      <Accordion type="multiple" className="grid gap-2">
        {provinces().map((province) => {
          const districts = childrenOf(province);
          const playable = districts.filter(isPlayable);
          const region = getRegion(province);

          return (
            <AccordionItem
              key={province}
              value={province}
              className="rounded-xl border border-border bg-card px-4 last:border-b"
            >
              <AccordionTrigger className="hover:no-underline">
                <span className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-3">
                  <span className="text-base font-semibold text-foreground">{region.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {region.partialCoverage && (
                      <span
                        className="rounded bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide"
                        title="Street imagery covers only part of this province"
                      >
                        partial
                      </span>
                    )}
                    {playable.length} of {districts.length}{' '}
                    {districts.length === 1 ? 'town' : 'districts'}
                  </span>
                </span>
              </AccordionTrigger>

              <AccordionContent className="grid gap-2">
                <PlayRow code={province} label={`Play anywhere in ${region.name}`} onPlayClick={onPlayClick} />
                {districts.map((district) =>
                  isPlayable(district) ? (
                    <PlayRow key={district} code={district} label={getRegion(district).name} onPlayClick={onPlayClick} />
                  ) : (
                    <UnavailableRow key={district} code={district} />
                  )
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
