// Reading cookies off a plain Request.
//
// Parses the Cookie header by hand rather than reading NextRequest.cookies or
// next/headers. Route handlers are driven by a plain Request in the tests, and
// a plain Request has no .cookies -- header parsing is the one form that works
// against both that and the NextRequest the framework really passes.

/**
 * Every value a request sends under one cookie name, in header order.
 *
 * All of them, not the first: a browser may legitimately send a name twice
 * (one cookie scoped to a path, another to '.domain'), and a caller that
 * validates values must be able to skip a stale or crafted duplicate.
 * @param {Request} request The incoming request.
 * @param {string} name Cookie name.
 * @returns {string[]}
 */
export function cookieValues(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return [];
  const values = [];
  for (const part of header.split(';')) {
    // Split on the first '=' only: a cookie value may legitimately contain
    // more of them, and slicing on the last would mangle the name.
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) values.push(part.slice(eq + 1).trim());
  }
  return values;
}
