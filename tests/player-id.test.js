import { describe, it, expect, afterEach } from 'vitest';
import {
  PLAYER_COOKIE,
  PLAYER_COOKIE_MAX_AGE,
  readPlayerId,
  newPlayerId,
  playerCookieOptions,
} from '../src/lib/player-id.js';

const ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const withCookie = (header) =>
  new Request('http://localhost/api/new-game', {
    headers: header == null ? {} : { cookie: header },
  });

describe('readPlayerId', () => {
  it('returns null when the request carries no cookies', () => {
    expect(readPlayerId(withCookie(null))).toBeNull();
  });

  it('returns null when other cookies are present but not ours', () => {
    expect(readPlayerId(withCookie('theme=dark; other=1'))).toBeNull();
  });

  it('reads the id when it stands alone', () => {
    expect(readPlayerId(withCookie(`${PLAYER_COOKIE}=${ID}`))).toBe(ID);
  });

  it('reads the id from among other cookies, in any position', () => {
    expect(readPlayerId(withCookie(`theme=dark; ${PLAYER_COOKIE}=${ID}; x=2`))).toBe(ID);
    expect(readPlayerId(withCookie(`${PLAYER_COOKIE}=${ID}; theme=dark`))).toBe(ID);
    expect(readPlayerId(withCookie(`theme=dark; ${PLAYER_COOKIE}=${ID}`))).toBe(ID);
  });

  // The id becomes a Redis key segment, and the adapter's scanKeys enumerates
  // that namespace: a value carrying ':' or '*' would name keys it does not own.
  it('rejects a value that is not a UUID', () => {
    for (const bad of [
      'not-a-uuid',
      '',
      'history:*',
      `${ID}:extra`,
      `${ID}x`,
      ID.slice(0, -1),
      'x'.repeat(500),
    ]) {
      expect(readPlayerId(withCookie(`${PLAYER_COOKIE}=${bad}`))).toBeNull();
    }
  });

  // A browser may send the name twice, one cookie per path or domain scope.
  // Stopping at the first bad one would disable the history for that browser
  // permanently, silently.
  it('keeps scanning past a shadowing duplicate to find a valid id', () => {
    expect(readPlayerId(withCookie(`${PLAYER_COOKIE}=garbage; ${PLAYER_COOKIE}=${ID}`))).toBe(ID);
    expect(readPlayerId(withCookie(`${PLAYER_COOKIE}=; x=1; ${PLAYER_COOKIE}=${ID}`))).toBe(ID);
  });

  it('rejects an uppercase twin rather than forking the history in two', () => {
    expect(readPlayerId(withCookie(`${PLAYER_COOKIE}=${ID.toUpperCase()}`))).toBeNull();
  });

  it('does not match a cookie whose name merely contains ours', () => {
    expect(readPlayerId(withCookie(`not_${PLAYER_COOKIE}=${ID}`))).toBeNull();
    expect(readPlayerId(withCookie(`${PLAYER_COOKIE}_old=${ID}`))).toBeNull();
  });

  it('tolerates whitespace and a trailing semicolon', () => {
    expect(readPlayerId(withCookie(`  ${PLAYER_COOKIE} = ${ID} ;`))).toBe(ID);
  });
});

describe('newPlayerId', () => {
  it('mints distinct ids that readPlayerId accepts', () => {
    const a = newPlayerId();
    const b = newPlayerId();
    expect(a).not.toBe(b);
    expect(readPlayerId(withCookie(`${PLAYER_COOKIE}=${a}`))).toBe(a);
  });
});

describe('playerCookieOptions', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('is httpOnly, lax and site-wide', () => {
    const options = playerCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(PLAYER_COOKIE_MAX_AGE);
  });

  // Over plain HTTP a secure cookie is dropped silently, which looks exactly
  // like the feature not working -- so dev and the e2e run must not get one.
  it('is secure only in production', () => {
    process.env.NODE_ENV = 'production';
    expect(playerCookieOptions().secure).toBe(true);
    process.env.NODE_ENV = 'development';
    expect(playerCookieOptions().secure).toBe(false);
    process.env.NODE_ENV = 'test';
    expect(playerCookieOptions().secure).toBe(false);
  });
});
