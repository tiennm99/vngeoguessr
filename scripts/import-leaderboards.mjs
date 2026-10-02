// Write a leaderboard backup back to Redis.
//
// Usage: node scripts/import-leaderboards.mjs <backup.json> [--replace] [--apply]
//   backup.json  decrypted output of export-leaderboards.mjs
//   --replace    delete each board in the file before writing it, so it ends
//                up exactly as backed up; without it each backed-up member's
//                score is set and newer members are kept
//   --apply      actually write; without it the script only reports what it
//                would do
//
// Needs the Upstash pair (UPSTASH_REDIS_REST_URL/_TOKEN or KV_REST_API_URL/
// _TOKEN) in .env or the environment, and KEY_PREFIX if the target uses one.
// This writes to whatever database those point at, usually production: run
// `npm run leaderboard:export` first so the restore itself can be undone.

import { readFileSync } from 'node:fs';
import { getUpstash } from '../src/lib/upstash.js';
import { applyEnvFile } from './lib/env.mjs';
import { parseBackup, restoreBoards } from './lib/leaderboard-restore.mjs';

applyEnvFile();

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
const replace = args.includes('--replace');
const apply = args.includes('--apply');
if (!file) {
  console.error('Usage: node scripts/import-leaderboards.mjs <backup.json> [--replace] [--apply]');
  process.exit(1);
}

const backup = parseBackup(readFileSync(file, 'utf8'));
const h = getUpstash();
const boardCount = Object.keys(backup.boards).length;
const memberCount = Object.values(backup.boards).reduce((sum, entries) => sum + entries.length, 0);

console.log(`Backup:  ${file} (exported ${backup.exportedAt ?? 'unknown'}, prefix "${backup.prefix ?? 'unknown'}")`);
console.log(`Target:  prefix "${h.prefix}"`);
console.log(`Content: ${boardCount} boards, ${memberCount} members`);
console.log(`Mode:    ${replace ? 'replace (each board is deleted, then rewritten)' : 'merge (backed-up scores are set, newer members kept)'}`);
if (backup.prefix && backup.prefix !== h.prefix) {
  console.log(`Note:    the backup came from prefix "${backup.prefix}" and will be written under "${h.prefix}"`);
}

if (!apply) {
  console.log('\nDry run, nothing written. Add --apply to write.');
  process.exit(0);
}

const result = await restoreBoards(h, backup.boards, replace);
console.log(`\nRestored ${result.boards} boards, ${result.members} members.`);
