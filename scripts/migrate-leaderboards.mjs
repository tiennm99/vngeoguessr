// Seed the two new province leaderboards from the towns they inherited.
//
//   node scripts/migrate-leaderboards.mjs                          # dry run
//   node scripts/migrate-leaderboards.mjs --apply --confirm-prefix=vngeoguessr:
//   node scripts/migrate-leaderboards.mjs --restore=<backup.json> --confirm-prefix=...
//
// Lam Dong and Long An are new nodes. Their only child -- Da Lat and Duc Hoa --
// already holds the full history, so without a backfill each province would
// disagree with its own single child from day one.
//
// RUN THIS AFTER DEPLOYING THE FAN-OUT, not before. Migrating first opens a
// window where a Da Lat guess credits DL and Vietnam but not Lam Dong, and the
// province is permanently short by that window. Deploying first is safe: a
// pre-migration LD only accumulates a subset of DL's deltas, which the copy
// then overwrites.
//
// Nothing else is touched. Ha Noi, Da Nang and Ho Chi Minh keep their history
// where it is: those points predate districts and cannot be attributed to one.
//
// The logic lives in scripts/lib/leaderboard-migration.mjs so its guards are
// testable; this file is argument handling and reporting.

import { writeFileSync, readFileSync } from 'node:fs';
import { getUpstash } from '../src/lib/upstash.js';
import {
  backfillPairs,
  copySortedSet,
  exportAll,
  findRegressions,
  restore,
  verifyTargets,
} from './lib/leaderboard-migration.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRunFlag = args.includes('--dry-run');
const restorePath = args.find((arg) => arg.startsWith('--restore='))?.split('=')[1];
const confirmed = args.find((arg) => arg.startsWith('--confirm-prefix='))?.split('=')[1];

if (dryRunFlag && apply) {
  // Typing both is a reasonable belt-and-braces instinct, and silently writing
  // would be the worst possible answer to it.
  throw new Error('--dry-run and --apply are mutually exclusive');
}

const h = getUpstash();
const writing = apply || Boolean(restorePath);
console.log(`key prefix: ${JSON.stringify(h.prefix)}`);
console.log(writing ? 'mode: WRITES ENABLED' : 'mode: dry run (no writes)');

if (writing && confirmed !== h.prefix) {
  // The prefix decides which namespace this touches, and getting it wrong is
  // silent: every read returns empty and every write lands somewhere nothing
  // reads. Make the operator name it.
  throw new Error(
    `Refusing to write: pass --confirm-prefix=${h.prefix} to confirm the target namespace` +
      (confirmed !== undefined ? ` (got ${JSON.stringify(confirmed)})` : '')
  );
}

/** Put a snapshot back. The backup is only a rollback if something reads it. */
async function runRestore(path) {
  const snapshot = JSON.parse(readFileSync(path, 'utf8'));
  const count = await restore(h, snapshot);
  console.log(`restored ${count} keys from ${path}`);
}

/** Back-fill the two new province boards from their single child. */
async function runBackfill() {
  const before = await exportAll(h);
  const keyCount = Object.keys(before).length;
  console.log(`exported ${keyCount} leaderboard keys`);

  if (keyCount === 0) {
    // An empty export is far more likely to be a wrong prefix than an empty
    // database, and it would make the backup -- the only rollback -- worthless.
    throw new Error(
      'Export found no leaderboard keys. That usually means KEY_PREFIX does not ' +
        'match the deployment. Refusing to continue: the backup would be empty.'
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `leaderboard-backup-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify(before, null, 1) + '\n');
  console.log(`backup -> ${backupPath}  (restore with --restore=${backupPath})`);

  console.log('');
  for (const { fromKey, toKey, label } of backfillPairs()) {
    const { members, replaced, skipped } = await copySortedSet(h, fromKey, toKey, apply);
    console.log(
      `${label.padEnd(20)} ${fromKey} -> ${toKey}: ` +
        (skipped ? 'both empty, nothing to do' : `${members} members`) +
        (replaced ? `, replacing ${replaced} already there` : '') +
        (apply || skipped ? '' : '  [dry run]')
    );
  }

  if (!apply) {
    console.log(`\nNothing written. Re-run with --apply --confirm-prefix=${h.prefix}`);
    return;
  }

  // Two checks, because they catch different failures: the destinations must
  // now match their sources, and nothing else may have gone backwards.
  const mismatched = await verifyTargets(h);
  if (mismatched.length > 0) {
    throw new Error(`Backfill did not land: ${mismatched.join('; ')}`);
  }

  const regressed = findRegressions(before, await exportAll(h));
  if (regressed.length > 0) {
    throw new Error(
      `Existing data regressed: ${regressed.join('; ')}. ` +
        `Restore with --restore=${backupPath} --confirm-prefix=${h.prefix}`
    );
  }

  console.log(`\napplied. Backfill verified, and ${keyCount} pre-existing keys intact.`);
}

if (restorePath) await runRestore(restorePath);
else await runBackfill();
