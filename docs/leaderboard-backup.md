# Leaderboard Backup and Restore

Every Monday `.github/workflows/leaderboard-backup.yml` exports all score and
distance boards from Redis, encrypts the JSON with `BACKUP_PASSPHRASE`, and
keeps it as the workflow artifact `leaderboard-backup` for 90 days. It can also
be run on demand from the Actions tab (*Run workflow*) or with
`gh workflow run leaderboard-backup.yml --ref main`.

## What it covers

Only the score and distance boards: the one piece of player data that cannot
be recreated. Not included, by design:

- game sessions (30 min), panorama history (3 days) and the daily pick
  (2 days): short-lived, and losing them costs at most one round
- play statistics (90 days): analytics only, play does not depend on them
- the panorama index in Neon: rebuilt from the data pipeline (`npm run data:refresh`)

## Decrypt a backup

You need `gh` (or a browser), `openssl`, and the `BACKUP_PASSPHRASE` value. The
passphrase lives only in the repository secrets and wherever you saved it when
you set it; GitHub will not show it again, and without it no backup can be
opened.

1. Pick a run. The newest successful one is usually what you want:

   ```bash
   gh run list --workflow leaderboard-backup.yml --limit 10
   ```

2. Download its artifact into the current directory. `gh` unzips it, leaving
   `leaderboard-backup.json.enc`:

   ```bash
   gh run download <run-id> -n leaderboard-backup
   ```

   Without `gh`: open the run on GitHub, download `leaderboard-backup` under
   *Artifacts*, and unzip it.

3. Decrypt. openssl prompts for the passphrase:

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -md sha256 \
     -in leaderboard-backup.json.enc -out leaderboard-backup.json
   ```

   To avoid typing it, put it in a variable first and pass
   `-pass env:BACKUP_PASSPHRASE` instead of answering the prompt.

4. Check the result. It is plain JSON:

   ```json
   {
    "exportedAt": "2026-10-02T04:35:40.000Z",
    "prefix": "vngeoguessr:",
    "boards": {
     "leaderboard:vietnam": [{ "member": "player-name", "score": 42 }],
     "distance:city:tphcm": [{ "member": "...", "score": 0.25 }]
    }
   }
   ```

   Each key under `boards` is a Redis sorted set without its prefix; entries
   are in ascending score order.

`bad decrypt` means the passphrase is wrong, or the openssl is too old to
match the encryption. The file is written by OpenSSL 3 on Ubuntu. On Linux and
on Windows (the `openssl` in Git Bash) that matches. On macOS, if the system
LibreSSL fails, use Homebrew's (`brew install openssl`, then run
`$(brew --prefix openssl)/bin/openssl` with the same arguments).

The decrypted file lists every player name. Do not commit it or attach it
anywhere public; `leaderboard-backup*.json` and the `.enc` file are gitignored
for that reason.

## Restore into Redis

`npm run leaderboard:import` writes a decrypted backup to the Redis that `.env`
(or the environment) points at, usually production.

1. Snapshot the current state first, so the restore itself can be undone:

   ```bash
   npm run leaderboard:export
   ```

2. Dry run. It writes nothing and prints the target prefix, the board and
   member counts, and the mode. Check the `Target:` line names the database
   you mean:

   ```bash
   npm run leaderboard:import -- leaderboard-backup.json
   ```

3. Write it:

   ```bash
   npm run leaderboard:import -- leaderboard-backup.json --apply
   ```

Modes:

- default (merge): each backed-up player's score is set back to its value in
  the backup; players who joined since keep their entries. Points scored after
  the backup by players already in it are lost.
- `--replace`: each board in the file is deleted first, so it ends up exactly
  as backed up.

Boards absent from the file are never touched in either mode, and the script
refuses any key that is not a `leaderboard:` or `distance:` board.
