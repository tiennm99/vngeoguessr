// Who may call the /api/debug/* routes.
//
// Those routes return panorama coordinates by id and by region, which is the
// answer to any live round, and each call spends Neon compute or a Mapillary
// request. They stay open where they are used: local development, the test
// suite and Vercel preview deployments. In production -- Vercel's production
// environment, or any production build outside Vercel -- they answer only a
// caller holding DEBUG_ACCESS_KEY, sent as the `x-debug-key` header or the
// `vng_debug` cookie; with no key configured they are closed.

import { timingSafeEqual } from 'node:crypto';
import { cookieValues } from './cookies.js';

const DEBUG_HEADER = 'x-debug-key';
const DEBUG_COOKIE = 'vng_debug';

/**
 * Whether a request may use the debug API.
 * @param {Request} request The incoming request.
 * @returns {boolean}
 */
export function debugAccessAllowed(request) {
  if (!isProduction()) return true;
  const key = process.env.DEBUG_ACCESS_KEY;
  if (!key) return false;
  const offered = [request.headers.get(DEBUG_HEADER), ...cookieValues(request, DEBUG_COOKIE)];
  return offered.some((value) => sameSecret(value, key));
}

/**
 * Compare a caller's value to the key in constant time, so the comparison
 * itself cannot say how much of the key was right.
 * @param {string|null} offered
 * @param {string} key
 * @returns {boolean}
 */
function sameSecret(offered, key) {
  if (typeof offered !== 'string') return false;
  const a = Buffer.from(offered);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Production means Vercel says so, or a production build with no Vercel at all. */
function isProduction() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production';
  return process.env.NODE_ENV === 'production';
}

/** The response a closed debug route gives: a 404, so the route does not advertise itself. */
export function debugForbidden() {
  return Response.json({ success: false, error: 'Not found' }, { status: 404 });
}
