"use client";

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
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
 */
function PlayRow({ code, label, emphasis }) {
  const { panos } = coverageOf(code);

  return (
    <Link
      href={`/game?region=${code}`}
      className={`group flex min-h-14 items-center justify-between gap-3 rounded-xl border p-4 shadow-xs transition-all duration-150 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        emphasis ? 'city-card-accent border-border bg-card' : 'border-border/60 bg-card/60'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="font-semibold text-foreground transition-colors group-hover:text-brand">
          {label}
        </span>
        {isThin(code) && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            few streets
          </span>
        )}
      </span>
      <span className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">{count(panos)}</span>
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
export default function RegionPicker() {
  return (
    <div className="grid gap-3">
      <PlayRow code={COUNTRY_CODE} label="Play anywhere in Vietnam" emphasis />

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
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
                        partial
                      </span>
                    )}
                    {playable.length} of {districts.length}{' '}
                    {districts.length === 1 ? 'town' : 'districts'}
                  </span>
                </span>
              </AccordionTrigger>

              <AccordionContent className="grid gap-2">
                <PlayRow code={province} label={`Play anywhere in ${region.name}`} />
                {districts.map((district) =>
                  isPlayable(district) ? (
                    <PlayRow key={district} code={district} label={getRegion(district).name} />
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
