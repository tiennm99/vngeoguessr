// Who may call the /api/debug/* routes.
//
// Those routes return panorama coordinates by id and by region, which is the
// answer to any live round, and each call spends Neon compute or a Mapillary
// request. Off Vercel production they stay open: local development, the test
// suite and preview deployments are where they are used. In production they
// answer only a caller holding DEBUG_ACCESS_KEY, sent as the `x-debug-key`
// header or the `vng_debug` cookie; with no key configured they are closed.

const DEBUG_HEADER = 'x-debug-key';
const DEBUG_COOKIE = 'vng_debug';

/** The value of one cookie on a request, or null. */
function readCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Whether a request may use the debug API.
 * @param {Request} request The incoming request.
 * @returns {boolean}
 */
export function debugAccessAllowed(request) {
  if (process.env.VERCEL_ENV !== 'production') return true;
  const key = process.env.DEBUG_ACCESS_KEY;
  if (!key) return false;
  return request.headers.get(DEBUG_HEADER) === key || readCookie(request, DEBUG_COOKIE) === key;
}

/** The response a closed debug route gives: a 404, so the route does not advertise itself. */
export function debugForbidden() {
  return Response.json({ success: false, error: 'Not found' }, { status: 404 });
}
