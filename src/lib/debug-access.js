// Who may call the /api/debug/* routes.
//
// Those routes return panorama coordinates by id and by region, which is the
// answer to any live round, and each call spends Neon compute or a Mapillary
// request. They stay open where they are used: local development, the test
// suite and Vercel preview deployments. In production -- Vercel's production
// environment, or any production build outside Vercel -- they answer only a
// caller holding DEBUG_ACCESS_KEY, sent as the `x-debug-key` header or the
// `vng_debug` cookie; with no key configured they are closed.

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
  return request.headers.get(DEBUG_HEADER) === key || cookieValues(request, DEBUG_COOKIE).includes(key);
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
