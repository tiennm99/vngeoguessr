"use client";

import { useState, useEffect, useRef } from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LeaderboardList from './LeaderboardList';
import RegionSelect from './RegionSelect';
import { COUNTRY_CODE, getRegion } from '../../lib/regions';

// The leaderboard feature: the header trigger button plus the dialog it opens.
// Owning the button here keeps the open gesture and the cache clear in one
// handler, exactly as they must run together -- opening with yesterday's cache
// would show a player their pre-round total.
export default function LeaderboardModal({ currentUsername }) {
  const [open, setOpen] = useState(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [level, setLevel] = useState('country');
  const [region, setRegion] = useState(COUNTRY_CODE);
  const [activeTypeTab, setActiveTypeTab] = useState('score');
  const [leaderboards, setLeaderboards] = useState({});
  // Which board failed, so an outage is not shown as an empty board.
  const [leaderboardError, setLeaderboardError] = useState(null);
  const fetchIdRef = useRef(0);

  const fetchLeaderboard = async (regionCode, type) => {
    const key = `${regionCode}-${type}`;

    // Bump first: a cache hit still supersedes whatever is in flight, and it
    // has to clear the spinner that request raised or a cached board renders
    // behind skeletons until an unrelated fetch settles.
    const currentFetchId = ++fetchIdRef.current;
    if (leaderboards[key]) {
      setLoadingLeaderboard(false);
      return;
    }

    setLoadingLeaderboard(true);
    try {
      const params = new URLSearchParams({ region: regionCode, type });
      const response = await fetch(`/api/leaderboard?${params.toString()}`);
      const data = await response.json();
      // A newer selection landed while this was in flight.
      if (currentFetchId !== fetchIdRef.current) return;

      if (!response.ok || !data.success) {
        // An empty array here would render as "No scores yet" and be cached as
        // such, so a backend outage would read as wiped leaderboards.
        throw new Error(data.error || `Leaderboard request failed (${response.status})`);
      }
      setLeaderboards((current) => ({ ...current, [key]: data.leaderboard }));
      setLeaderboardError(null);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      if (currentFetchId === fetchIdRef.current) setLeaderboardError(key);
    } finally {
      if (currentFetchId === fetchIdRef.current) setLoadingLeaderboard(false);
    }
  };

  // Only the board on screen is fetched. Fetching every one was viable at five
  // cities; at 67 regions it would be 134 requests on a single click.
  useEffect(() => {
    if (open && region) fetchLeaderboard(region, activeTypeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, region, activeTypeTab]);

  const handleLeaderboardClick = () => {
    // Cleared on open so a player who just scored does not see their old total.
    // Kept within a session so switching level or type back is free.
    setLeaderboards({});
    setLeaderboardError(null);
    setOpen(true);
  };

  const rows = leaderboards[`${region}-${activeTypeTab}`] ?? [];

  return (
    <>
      <Button
        onClick={handleLeaderboardClick}
        variant="outline"
      >
        <Trophy className="size-4" aria-hidden="true" />
        Leaderboard
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center font-bold">
              {region ? getRegion(region).name : 'Leaderboards'}
            </DialogTitle>
            {/* sr-only: the region select and type toggle right below say the
                same thing visually; Radix still needs a description. */}
            <DialogDescription className="sr-only">
              Score and best-distance leaderboards, by country, province, or district.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RegionSelect
              level={level}
              onLevelChange={setLevel}
              region={region}
              onRegionChange={setRegion}
            />

            <div className="flex gap-3">
              <div className="flex flex-col gap-2 min-w-[104px]">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">Type</div>
                <div role="group" aria-label="Leaderboard type" className="flex flex-col overflow-hidden rounded-lg border border-border">
                  {['score', 'distance'].map((type, index) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setActiveTypeTab(type)}
                      aria-pressed={activeTypeTab === type}
                      className={`h-11 px-3 text-left text-sm font-semibold capitalize outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:-ring-offset-1 ${
                        index > 0 ? 'border-t border-border' : ''
                      } ${
                        activeTypeTab === type
                          ? 'bg-brand text-brand-foreground'
                          : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                {leaderboardError === `${region}-${activeTypeTab}` ? (
                  <div className="py-10 text-center" role="alert">
                    <p className="text-base text-foreground">Couldn&apos;t load this leaderboard</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The scores are still there. Try again in a moment.
                    </p>
                  </div>
                ) : (
                <LeaderboardList
                  data={rows}
                  loading={loadingLeaderboard}
                  currentUsername={currentUsername}
                  type={activeTypeTab}
                />
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
