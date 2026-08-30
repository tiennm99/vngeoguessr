"use client";

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  COUNTRY_CODE,
  childrenOf,
  getRegion,
  isPlayable,
  isThin,
  provinces,
} from '../../lib/regions';

const LEVELS = [
  { id: 'country', label: 'Vietnam' },
  { id: 'province', label: 'Province' },
  { id: 'district', label: 'District' },
];

/**
 * Pick a region by level, then by name.
 *
 * A flat list of 67 nodes is unusable, and one tab per node is worse -- the
 * leaderboard used to lay out one column per city, which at 67 columns will not
 * fit on any screen. Level first, then a grouped select, keeps it to two
 * controls at any size.
 *
 * Props follow the convention the other components here use: a destructured
 * props object, which is how React passes them.
 *
 * @param {Object} props
 * @param {string} props.level Currently selected level id.
 * @param {Function} props.onLevelChange Called with the new level id.
 * @param {string} props.region Currently selected region code.
 * @param {Function} props.onRegionChange Called with the new region code.
 * @param {boolean} props.playableOnly True to hide regions with no coverage.
 */
export default function RegionSelect({
  level,
  onLevelChange,
  region,
  onRegionChange,
  playableOnly = false,
}) {
  // Districts are grouped under their province: 61 of them in one flat list is
  // the problem the level row exists to avoid, and it would only move it.
  const groups = useMemo(() => {
    if (level === 'country') return [];
    if (level === 'province') {
      return [{ label: null, codes: provinces().filter((code) => !playableOnly || isPlayable(code)) }];
    }
    return provinces()
      .map((province) => ({
        label: getRegion(province).name,
        codes: childrenOf(province).filter((code) => !playableOnly || isPlayable(code)),
      }))
      .filter((group) => group.codes.length > 0);
  }, [level, playableOnly]);

  const handleLevel = (next) => {
    onLevelChange(next);
    // Move the selection somewhere valid for the new level rather than leaving
    // a district selected under the province tab.
    onRegionChange(firstOf(next, playableOnly));
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div
        role="group"
        aria-label="Region level"
        className="flex overflow-hidden rounded-lg border border-border"
      >
        {LEVELS.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => handleLevel(entry.id)}
            aria-pressed={level === entry.id}
            className={`h-9 flex-1 px-3 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring ${
              index > 0 ? 'border-l border-border' : ''
            } ${
              level === entry.id
                ? 'bg-brand text-brand-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {level !== 'country' && (
        <Select value={region ?? undefined} onValueChange={onRegionChange}>
          <SelectTrigger className="w-full sm:w-56" aria-label={`Choose a ${level}`}>
            <SelectValue placeholder={`Choose a ${level}`} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group.label ?? 'all'}>
                {group.label && <SelectLabel>{group.label}</SelectLabel>}
                {group.codes.map((code) => (
                  <SelectItem key={code} value={code}>
                    {getRegion(code).name}
                    {isThin(code) ? ' · few streets' : ''}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/**
 * First selectable region at a level, so switching levels lands somewhere real.
 * @param {string} level Level id.
 * @param {boolean} playableOnly True to skip regions with no coverage.
 * @returns {string} Region code.
 */
function firstOf(level, playableOnly) {
  if (level === 'country') return COUNTRY_CODE;
  if (level === 'province') {
    return provinces().find((code) => !playableOnly || isPlayable(code)) ?? COUNTRY_CODE;
  }
  for (const province of provinces()) {
    const found = childrenOf(province).find((code) => !playableOnly || isPlayable(code));
    if (found) return found;
  }
  return COUNTRY_CODE;
}
