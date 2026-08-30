---
phase: 3
title: "Leaderboard fan-out and migration"
status: todo
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 3: Leaderboard fan-out and migration

## Overview

Make a single guess credit its leaf, its province, and Vietnam — without moving,
renaming, or resetting a single existing key. Then seed the two brand-new province
nodes from the children whose history they inherit.

This is the phase where data can be lost. Two red-team findings here were about
the *recovery* story being worse than the failure it recovers from — read H2
before writing the migration.

## Requirements

**Functional**
- `submitScore` and `submitDistanceRecord` write to every ancestor of the region
  passed in.
- `getLeaderboard` accepts any region code, validated against the tree.
- `VN` reads and writes the existing `leaderboard:vietnam` / `distance:vietnam`.
- `leaderboard:city:ld` seeded from `:dl`, `:la` from `:dh` — score and distance.
- Every pre-existing key keeps its exact contents.

**Non-functional**
- The migration is idempotent, defaults to dry-run, and **aborts if its export
  contains zero keys**.
- It prints the resolved `KEY_PREFIX` before touching anything.
- Validation lives in the library, not only in the routes.

## Architecture

### C4 — Key names in this plan are *logical*

`src/lib/upstash.js:12` states it: "every physical Upstash key carries
KEY_PREFIX". `DEFAULT_KEY_PREFIX = 'vngeoguessr:'` (`:17`), overridable by
`process.env.KEY_PREFIX` (`:34`), applied inside `pkey()` (`:40-42`). Callers
never see it.

Every key name written in this plan is logical. The physical form is
`${KEY_PREFIX}${logical}`. A migration script that reaches past the adapter and
issues `ZRANGE leaderboard:city:dl` reads an **empty namespace**, reports zero
members, and "succeeds" having done nothing.

### C4 — The export needs a primitive that does not exist

The adapter exposes ten commands — `getJson`, `putJson`, `del`, `zAdd`, `zScore`,
`zRangeWithScores`, `zRank`, `zRevRank`, `zRemRangeByRank`, plus `getUpstash`.
There is **no** `scan` and no `keys`. The earlier draft made a full export the
precondition for any write while restricting `upstash.js` to "namespace comment
only" — a contradiction.

Add `scanKeys(h, pattern)` as a real deliverable: prefix-aware, stripping the
prefix on return, mirrored in `tests/fake-upstash-redis.js` (which documents
itself as covering "nine commands" and must grow to match).

### Why the key names do not change

```
leaderboard:vietnam              sorted set (score)
leaderboard:city:{regionCode}    sorted set (score)
distance:vietnam                 sorted set (distance)
distance:city:{regionCode}       sorted set (distance)
```

Renaming `:city:` to `:region:` would read better and strand every existing key.
`getCityLeaderboardKey` becomes `getRegionLeaderboardKey`, still emitting
`leaderboard:city:<lowercased code>`, with a comment recording why the segment
says `city`. `VN` special-cases to the two legacy country keys.

| Node | Score key (logical) | Distance key (logical) |
|---|---|---|
| `VN` | `leaderboard:vietnam` | `distance:vietnam` |
| `TPHCM` | `leaderboard:city:tphcm` | `distance:city:tphcm` |
| `TPHCM-Q7` | `leaderboard:city:tphcm-q7` | `distance:city:tphcm-q7` |
| `LD` | `leaderboard:city:ld` | `distance:city:ld` |
| `DL` | `leaderboard:city:dl` | `distance:city:dl` |

67 nodes × 2 = 134 sorted sets at full occupancy, each capped at 200 entries.

### Fan-out

```js
export async function submitScore(username, score, regionCode) {
  const chain = ancestorsOf(regionCode);        // ['TPHCM-Q7','TPHCM','VN']
  // read every current total, add, write back, trim — as today, per level
}
```

**C6 — validate in the library.** `getCityLeaderboardKey` currently
string-concatenates a lowercased caller value (`leaderboard.js:19-21`) and
`/api/leaderboard` passes `searchParams.get('city')` straight through
(`leaderboard/route.js:7-12`). Route-level validation is not enough: the
migration script and every future caller bypass routes. Validate `regionCode`
against `REGIONS` **inside** `submitScore`, `submitDistanceRecord`, and
`getLeaderboard`, and throw on an unknown code rather than creating a key for a
typo. Clamp `limit` to `[1, 200]` (today `parseInt(...) || 100` accepts `-1`,
which reaches `zRangeWithScores(h, key, 0, -2)`).

Return shape becomes a `levels` array plus named aliases:

```js
{
  success: true,
  levels: [
    { code: 'TPHCM-Q7', name: 'District 7',  score: 12,  rank: 4 },
    { code: 'TPHCM',    name: 'Ho Chi Minh', score: 88,  rank: 11 },
    { code: 'VN',       name: 'Vietnam',     score: 402, rank: 37 },
  ],
  district: { ... }, province: { ... }, global: { ... },
}
```

`global` keeps its current meaning so `GameClient`'s existing handling survives
until Phase 5.

For distances, generate the entry id `username:distance:timestamp` **once** and
write the same id to all three levels, so a record is identifiable across them.

### H1 — The guess handler is not idempotent, and the earlier claim was false

The earlier draft said "the three writes already run under `Promise.all`; a
rejection surfaces as a 500 and the guess is not silently half-recorded". Both
halves are wrong. `Promise.all` does not roll back — resolved writes are
committed. And `/api/guess` runs `submitScore` (`:65`), then
`submitDistanceRecord` (`:68`), and deletes the session only at `:83`. A failure
in the second leaves the score written *and* the session replayable for up to 30
minutes, so a retry double-credits all three levels.

Fan-out widens this from 2 keys to 6. Phase 4 owns the fix (consume the session
before the writes); this phase owns deleting the false claim and adding the
matching test.

**Not fixed here, recorded:** `submitScore` reads with `zScore` then writes with
`zAdd` rather than `ZINCRBY`, so concurrent guesses by one player can lose an
increment. Pre-existing. Fixing it means adding `zIncrBy` to the adapter — a
clean, separable follow-up, as is pipelining the now-21 REST round trips per
guess.

### H2 — Migration: ordering, replacement, and a recovery story that destroyed data

Three corrections to the earlier draft.

**Ordering is now pinned: deploy the fan-out first, then migrate.** The earlier
draft left it undefined. Migrating first opens a window where Da Lat guesses
credit `:dl` and `leaderboard:vietnam` but not `:ld`, permanently shorting the
new province — and the script was documented as one-off, so nothing re-runs.
Deploying first is safe because a pre-migration `:ld` only accumulates a subset
of `:dl`'s deltas, which the copy then overwrites.

**Copy is not replace.** Writing each source member into the destination leaves
any destination-only member behind with a stale score — reachable because the
200-cap (`leaderboard.js:16,115-116`) can trim a player out of `:dl` while they
persist in `:ld`. The script `DEL`s the destination inside the same run before
copying.

**The reconciliation suggestion is deleted.** The earlier draft offered "a
reconciliation script can rebuild a province from its children later". That
directly contradicts this plan's own Key Decision and Goal 3: province sets hold
legacy history with *no* corresponding district entries, so rebuilding from
children **deletes every point earned before this change**. If drift is ever
reconciled, the formula is `province = legacy baseline snapshot + sum(children)`,
and `migrate-leaderboards.mjs` must capture that baseline snapshot as a committed
artefact.

`scripts/migrate-leaderboards.mjs`:

1. Print the resolved `KEY_PREFIX`. Export every `leaderboard:*` and `distance:*`
   key via `scanKeys`, with members and scores, to a timestamped JSON file.
   **Abort if the export contains zero keys** — an empty export is a wrong-prefix
   symptom, not a clean slate.
2. Write the legacy baseline snapshot for `HN`, `DN`, `TPHCM` alongside it.
3. `DEL` destination, then copy `:dl` → `:ld` and `:dh` → `:la` with **absolute
   scores**, score and distance both.
4. Report per-key member counts before and after. Abort if either source is empty.
5. `--dry-run` is the default; `--apply` is explicit; `--confirm-prefix=<value>`
   is required so a wrong-namespace run is impossible.

Only `LD` and `LA` are seeded. `HN`, `DN`, and `TPHCM` keep their history where
it is.

## Related Code Files

- Modify: `src/lib/leaderboard.js` — fan-out, `VN` mapping, library-level validation, return shape
- Modify: `src/lib/upstash.js` — add `scanKeys`; update the namespace comment
- Modify: `tests/fake-upstash-redis.js` — mirror `scanKeys`
- Create: `scripts/migrate-leaderboards.mjs`
- Modify: `tests/leaderboard.test.js`

## Implementation Steps

1. Add `scanKeys(h, pattern)` to the adapter and the fake.
2. Replace the key helpers with region-aware versions; special-case `VN`.
   Comment why the key segment still reads `city`.
3. Rewrite `submitScore` to resolve `ancestorsOf(regionCode)` and apply the
   existing read-add-write-trim per level. Validate the code against `REGIONS`
   first.
4. Same for `submitDistanceRecord`, generating the entry id once.
5. Extend `getLeaderboard` to any validated code; clamp `limit` to `[1, 200]`.
6. Delete the false `Promise.all` claim from the risk notes; add the
   replay/double-credit test.
7. Write `scripts/migrate-leaderboards.mjs` per H2.
8. Extend `tests/leaderboard.test.js`.
9. `npm test`, then `npm run test:integration` (`npm run redis:up` first) — this
   phase touches persistence, so the fake alone is not enough.

## Validation

- A guess at `TPHCM-Q7` worth 3 points raises `leaderboard:city:tphcm-q7`,
  `:tphcm`, and `leaderboard:vietnam` by exactly 3 each.
- A guess at `DL` raises `:dl`, `:ld`, and `leaderboard:vietnam`.
- A province-level guess on an unassigned panorama raises two levels, not three.
- `getLeaderboard('VN')` and `getLeaderboard(null)` return the same rows.
- Unknown region code throws from the **library**, not just the route; no key created.
- `limit=-1` and `limit=99999` both clamp.
- Migration with a wrong `--confirm-prefix` refuses to run.
- Migration against an empty namespace aborts instead of reporting success.
- Dry-run writes nothing and reports the intended copies.
- Applied twice, scores are identical; a destination-only orphan is removed.
- Every key present before the migration is present after with identical members
  and scores — diff the export against a fresh export.
- A replayed guess (session still alive) does not double-credit.

## Risk Assessment

**The migration runs against the wrong namespace.** *Signal:* the export is empty
or the printed prefix is unexpected. *Response:* the zero-key abort and
`--confirm-prefix` make this impossible to do silently. This was the most likely
way to lose data and now fails closed.

**The migration corrupts live leaderboards.** *Signal:* post-run export differs
outside the four seeded keys. *Response:* the export is the rollback; restore
from it. Never `--apply` without a successful non-empty export in the same run.

**Someone reconciles a province from its children.** *Signal:* a proposal to
"rebuild `:tphcm` from its 22 districts". *Response:* that deletes all pre-change
history. Only `legacy baseline + sum(children)` is valid, and the baseline is the
artefact step 2 commits.

**Fan-out partially fails.** *Signal:* a 500 from `/api/guess` with some levels
written. *Response:* Phase 4 consumes the session before writing, so a retry
cannot double-credit. Residual single-level drift is accepted; leaf totals are
the finer-grained record.

**Trimming interacts with three levels.** A player visible on their district board
may be absent from the country board once it exceeds 200. Correct behaviour — it
already happens between city and global today. Recorded so it is not mistaken for
a fan-out bug.

## Success Criteria

- [ ] One guess writes all ancestor levels, score and distance both
- [ ] `VN` maps to `leaderboard:vietnam` / `distance:vietnam`
- [ ] `scanKeys` exists in both the adapter and the fake
- [ ] Region codes and `limit` are validated inside the library
- [ ] `leaderboard:city:ld` equals `:dl`, and `:la` equals `:dh`
- [ ] Every pre-existing key is unchanged after the migration
- [ ] The migration prints its prefix, aborts on an empty export, requires `--confirm-prefix`, and `DEL`s before copying
- [ ] The legacy baseline snapshot for HN/DN/TPHCM is committed
- [ ] Migration ordering is documented as deploy-then-migrate
- [ ] `npm test` and `npm run test:integration` pass
