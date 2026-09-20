import { describe, it, expect, afterEach } from 'vitest';
import { debugAccessAllowed } from '../src/lib/debug-access.js';

// The debug routes return panorama coordinates. Open anywhere but Vercel
// production, where they answer only a caller holding the configured key.

const ORIGINAL = { env: process.env.VERCEL_ENV, key: process.env.DEBUG_ACCESS_KEY };

function request(headers = {}) {
  return new Request('http://localhost/api/debug/pano?id=1', { headers });
}

afterEach(() => {
  process.env.VERCEL_ENV = ORIGINAL.env;
  process.env.DEBUG_ACCESS_KEY = ORIGINAL.key;
  if (ORIGINAL.env === undefined) delete process.env.VERCEL_ENV;
  if (ORIGINAL.key === undefined) delete process.env.DEBUG_ACCESS_KEY;
});

describe('debugAccessAllowed', () => {
  it('is open off production, including preview deployments', () => {
    delete process.env.VERCEL_ENV;
    expect(debugAccessAllowed(request())).toBe(true);
    process.env.VERCEL_ENV = 'preview';
    expect(debugAccessAllowed(request())).toBe(true);
  });

  it('is closed in production with no key configured', () => {
    process.env.VERCEL_ENV = 'production';
    delete process.env.DEBUG_ACCESS_KEY;
    expect(debugAccessAllowed(request({ 'x-debug-key': 'anything' }))).toBe(false);
  });

  it('opens in production to the header or the cookie carrying the key', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.DEBUG_ACCESS_KEY = 'secret-key';
    expect(debugAccessAllowed(request())).toBe(false);
    expect(debugAccessAllowed(request({ 'x-debug-key': 'wrong' }))).toBe(false);
    expect(debugAccessAllowed(request({ 'x-debug-key': 'secret-key' }))).toBe(true);
    expect(debugAccessAllowed(request({ cookie: 'theme=dark; vng_debug=secret-key' }))).toBe(true);
  });
});
