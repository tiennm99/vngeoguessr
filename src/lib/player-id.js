// The anonymous per-browser player id, carried in a cookie.
//
// The game has no accounts. The leaderboard keys on the username the player
// typed, which lives in localStorage, is renameable, and only ever reaches
// /api/guess -- none of which makes it usable as a key for "what has this
// player already been shown". Renaming would silently wipe the history, and a
// player claiming someone else's name would inherit theirs.
//
// So this module mints an opaque id the server controls, and nothing else. It
// identifies a browser for the sole purpose of not repeating locations; it
// carries no personal data, is never shown to the player, and is never joined
// to a username or a score.
//
// SERVER-SIDE ONLY, but only by convention: nothing here touches Redis or the
// panorama index, so the boundary that matters is that the value is httpOnly
// and the client has no reason to read it.

export const PLAYER_COOKIE = 'vng_pid';

// Longer than the history's own TTL on purpose. The cookie is refreshed on
// every round, so an active player keeps one stable id while their data still
// ages out after three idle days -- the id outliving the data costs nothing,
// the data outliving the id would orphan it.
export const PLAYER_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// Exactly the shape crypto.randomUUID() produces, lowercase included. The id
// becomes a Redis key segment, so a hand-crafted cookie must not be able to
// smuggle a glob, a colon or an unbounded string into the keyspace: one ':'
// would let a caller name a key it does not own, and the adapter's glob
// enumerator would sweep it up with the rest. Case-sensitive on purpose --
// accepting an uppercase twin would silently fork one browser's history in two.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Read the player id off a request, if it has a valid one.
 *
 * Parses the Cookie header by hand rather than reading NextRequest.cookies or
 * next/headers. Route handlers are driven by a plain Request in the tests, and
 * a plain Request has no .cookies -- header parsing is the one form that works
 * against both that and the NextRequest the framework really passes.
 * @param {Request} request The incoming request.
 * @returns {string|null} The id, or null when absent or malformed.
 */
export function readPlayerId(request) {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    // Split on the first '=' only: a cookie value may legitimately contain
    // more of them, and slicing on the last would mangle the name.
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== PLAYER_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    // Keep scanning past a value that fails validation rather than giving up.
    // A browser may legitimately send the name twice -- one cookie scoped to a
    // path, another to '.domain' -- and stopping at the first bad one would let
    // a single stale or crafted duplicate disable the history for that browser
    // permanently, with nothing anywhere reporting it.
    if (UUID_PATTERN.test(value)) return value;
  }
  return null;
}

/**
 * Mint a new player id.
 * @returns {string} A UUID.
 */
export function newPlayerId() {
  return crypto.randomUUID();
}

/**
 * Cookie attributes for setting the player id on a response.
 *
 * httpOnly because no client code reads it. `secure` is conditional so local
 * HTTP development and the Playwright run still receive the cookie; over
 * plain HTTP a secure cookie is silently dropped, which would look exactly
 * like the feature not working.
 * @returns {{httpOnly: boolean, sameSite: string, path: string, maxAge: number, secure: boolean}}
 */
export function playerCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: PLAYER_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  };
}
