// Parse and apply a .env file, the way every offline pipeline script needs to:
// none of them may assume `next dev`'s automatic .env loading, since they run
// standalone under plain `node`.
//
// One copy, because four scripts used to carry their own, and one of those
// copies had silently drifted: it did not strip the quotes `vercel env pull`
// wraps values in, so a pulled DATABASE_URL would fail to dial with the quotes
// still attached.

import { readFileSync, existsSync } from 'node:fs';

/**
 * Parse .env-format text into a plain key/value map.
 *
 * Blank lines and full-line comments are skipped. A value quoted with `"..."`
 * (as `vercel env pull` writes) has its quotes stripped; unquoted values keep
 * an embedded `=` intact because only the first `=` on the line splits key
 * from value.
 * @param {string} text Raw .env file contents.
 * @returns {Object<string, string>} Parsed key/value map.
 */
export function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=');
        const key = line.slice(0, at).trim();
        const value = line.slice(at + 1).trim().replace(/^"(.*)"$/, '$1');
        return [key, value];
      })
  );
}

/**
 * Read and parse a .env file.
 * @param {string} path File path, defaults to '.env' in the process cwd.
 * @returns {Object<string, string>} Parsed key/value map, or {} when the file
 *   is absent -- every caller treats a missing .env as "use the environment
 *   instead", not as an error.
 */
export function loadEnvFile(path) {
  const target = path ?? '.env';
  if (!existsSync(target)) return {};
  return parseEnv(readFileSync(target, 'utf8'));
}

/**
 * Load a .env file into process.env, without overriding a variable the
 * environment already set.
 * @param {string} path File path, defaults to '.env' in the process cwd.
 * @returns {void}
 */
export function applyEnvFile(path) {
  for (const [key, value] of Object.entries(loadEnvFile(path))) {
    process.env[key] ??= value;
  }
}
