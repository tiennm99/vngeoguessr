// Print the daily play statistics /api/guess records in Redis.
//
// Usage: node scripts/stats.mjs [days]
//   days  how many most-recent days to show (default 14)
//
// Needs the Upstash pair (UPSTASH_REDIS_REST_URL/_TOKEN or KV_REST_API_URL/
// _TOKEN) in .env or the environment. Read-only: a handful of HGETALL and
// PFCOUNT commands, nothing written.
//
// Columns: rounds and distinct players that day, rounds per player, and the
// share of rounds that scored zero at each level the player could pick. The
// last line counts distinct players across the whole window against the sum of
// the daily counts: the difference is player-days from someone who had
// already played on another day in the window, the cheapest available
// measure of whether anyone comes back.

import { statsDays, readDay, distinctPlayersAcross } from '../src/lib/stats.js';
import { applyEnvFile } from './lib/env.mjs';

applyEnvFile();

const LEVELS = ['country', 'province', 'district', 'daily'];
const windowDays = Math.max(1, Number(process.argv[2]) || 14);

const days = (await statsDays()).slice(-windowDays);
if (days.length === 0) {
  console.log('No statistics recorded yet.');
  process.exit(0);
}

const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '-');
const header = ['day', 'rounds', 'players', 'r/p', ...LEVELS.map((level) => `${level} 0-share`)];
const rows = [header];
let totalRounds = 0;
let sumPlayers = 0;

for (const day of days) {
  const stats = await readDay(day);
  totalRounds += stats.rounds;
  sumPlayers += stats.players;
  rows.push([
    stats.day,
    String(stats.rounds),
    String(stats.players),
    stats.players ? (stats.rounds / stats.players).toFixed(1) : '-',
    ...LEVELS.map((level) => {
      const bucket = stats.byLevel[level];
      return bucket ? `${pct(bucket.zero, bucket.rounds)} of ${bucket.rounds}` : '-';
    }),
  ]);
}

const widths = header.map((_, i) => Math.max(...rows.map((row) => row[i].length)));
for (const row of rows) {
  console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  '));
}

const distinct = await distinctPlayersAcross(days);
console.log('');
console.log(`${days.length} days, ${totalRounds} rounds, ${distinct} distinct players.`);
console.log(
  `${sumPlayers - distinct} returning player-days (${pct(sumPlayers - distinct, sumPlayers)} of ${sumPlayers} player-days).`
);
