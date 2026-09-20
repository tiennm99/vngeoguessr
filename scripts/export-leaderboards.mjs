// Write every leaderboard to one JSON file, for backup.
//
// Usage: node scripts/export-leaderboards.mjs [out.json]
//   default output: leaderboard-backup-YYYYMMDD.json (gitignored)
//
// Needs the Upstash pair (UPSTASH_REDIS_REST_URL/_TOKEN or KV_REST_API_URL/
// _TOKEN) in .env or the environment. Read-only. Every score and distance
// board is dumped whole, member and score, under its logical key, so the file
// can be replayed with ZADD against any prefix.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getUpstash, scanKeys, zRangeWithScores } from '../src/lib/upstash.js';

/** Read .env the way the other scripts do, without pulling in a dependency. */
function loadEnvFile() {
  if (!existsSync('.env')) return {};
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"(.*)"$/, '$1')];
      })
  );
}

for (const [key, value] of Object.entries(loadEnvFile())) {
  process.env[key] ??= value;
}

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outPath = process.argv[2] ?? `leaderboard-backup-${stamp}.json`;

const h = getUpstash();
const keys = [...(await scanKeys(h, 'leaderboard:*')), ...(await scanKeys(h, 'distance:*'))].sort();

const boards = {};
let members = 0;
for (const key of keys) {
  // Ascending, whole set: the same order for every board, so two exports diff
  // cleanly.
  const entries = await zRangeWithScores(h, key, 0, -1, false);
  boards[key] = entries.map(({ value, score }) => ({ member: value, score }));
  members += entries.length;
}

writeFileSync(
  outPath,
  JSON.stringify({ exportedAt: new Date().toISOString(), prefix: h.prefix, boards }, null, 1) + '\n'
);
console.log(`${keys.length} boards, ${members} members -> ${outPath}`);
