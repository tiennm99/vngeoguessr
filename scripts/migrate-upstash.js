// One-shot migration: copy leaderboard sorted-set data from the OLD Redis DB
// to the NEW Upstash DB, prepending KEY_PREFIX (default 'vngeoguessr:') on
// write. The two DBs use different protocols on Vercel:
//
//   OLD (source)      → TCP protocol via OLD_STORAGE_REDIS_URL  (node-redis)
//   NEW (destination) → REST API via KV_REST_API_URL/_TOKEN     (@upstash/redis)
//
// Sessions are NOT migrated (30-min TTL, ephemeral).
//
// Usage:
//   1. Pull env into .env.migrate:    vercel env pull .env.migrate
//      (gives you OLD_STORAGE_REDIS_URL, KV_REST_API_URL, KV_REST_API_TOKEN)
//   2. Optionally set KEY_PREFIX in .env.migrate (defaults to 'vngeoguessr:')
//   3. Dry run:  node --env-file=.env.migrate scripts/migrate-upstash.js --dry-run
//   4. Live:     node --env-file=.env.migrate scripts/migrate-upstash.js

import { createClient } from 'redis';
import { Redis } from '@upstash/redis';

const DEFAULT_KEY_PREFIX = 'vngeoguessr:';
const SCAN_PATTERNS = ['leaderboard:*', 'distance:*'];

const dryRun = process.argv.includes('--dry-run');
const PREFIX = process.env.KEY_PREFIX ?? DEFAULT_KEY_PREFIX;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const oldUrl = requireEnv('OLD_STORAGE_REDIS_URL');
const newRestUrl = process.env.UPSTASH_REDIS_REST_URL ?? requireEnv('KV_REST_API_URL');
const newRestToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? requireEnv('KV_REST_API_TOKEN');

const newClient = new Redis({ url: newRestUrl, token: newRestToken });

console.log('Upstash leaderboard migration');
console.log(`  source:   OLD_STORAGE_REDIS_URL (TCP / node-redis)`);
console.log(`  dest:     ${newRestUrl}`);
console.log(`  prefix:   ${PREFIX}  (must match Vercel runtime KEY_PREFIX)`);
console.log(`  mode:     ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
console.log('');

// Normalize NEW DB SDK zrange withScores response into [{ score, member }, ...].
// The migration script also uses this shape for ZADD args.
function reshapeWithScores(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'object' && raw[0] !== null && 'member' in raw[0]) {
    return raw.map((entry) => ({ score: Number(entry.score), member: entry.member }));
  }
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    out.push({ member: raw[i], score: Number(raw[i + 1]) });
  }
  return out;
}

async function main() {
  const oldClient = await createClient({ url: oldUrl }).connect();

  // Discover source keys via SCAN — node-redis exposes scanIterator.
  const sourceKeys = new Set();
  for (const pattern of SCAN_PATTERNS) {
    for await (const key of oldClient.scanIterator({ MATCH: pattern, COUNT: 200 })) {
      // node-redis v5 yields strings (or arrays of strings depending on version).
      if (Array.isArray(key)) key.forEach((k) => sourceKeys.add(k));
      else sourceKeys.add(key);
    }
  }

  const sortedKeys = Array.from(sourceKeys).sort();
  console.log(`Discovered ${sortedKeys.length} source keys:`);
  for (const k of sortedKeys) console.log(`  - ${k}`);
  console.log('');

  let totalMembers = 0;
  let migratedKeys = 0;

  for (const key of sortedKeys) {
    // node-redis v5 returns [{ value, score }, ...] for zRangeWithScores.
    const raw = await oldClient.zRangeWithScores(key, 0, -1);
    if (!raw || raw.length === 0) {
      console.log(`  [skip] ${key}  (empty)`);
      continue;
    }
    const entries = raw.map((e) => ({ score: Number(e.score), member: e.value }));

    const physicalKey = `${PREFIX}${key}`;
    console.log(`  [${dryRun ? 'dry' : 'write'}] ${physicalKey}  (${entries.length} members)`);
    totalMembers += entries.length;
    migratedKeys += 1;

    if (dryRun) continue;

    // ZADD against NEW DB via REST. Chunk to keep request sane.
    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      await newClient.zadd(physicalKey, ...chunk);
    }
  }

  await oldClient.quit();

  console.log('');
  console.log('Summary:');
  console.log(`  source keys discovered: ${sortedKeys.length}`);
  console.log(`  keys migrated:          ${migratedKeys}`);
  console.log(`  members copied:         ${totalMembers}`);
  console.log(`  prefix applied:         ${PREFIX}`);
  if (dryRun) console.log('  (dry run — no writes performed)');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
