// The two failure kinds a round draw can end in, as classes rather than
// message prefixes.
//
// A dry pool is a game condition: the region, or what is left of it after the
// exclusions, holds nothing to show. An upstream failure is infrastructure:
// Mapillary or the network did not answer. The two used to be told apart by
// string-matching error messages in eight places, so a reworded message
// silently turned "no coverage" into a 500. Callers now use instanceof.

/** The pool a draw was made from is empty. Not an outage. */
export class DryPoolError extends Error {
  /**
   * @param {string} regionCode Region the draw was for.
   */
  constructor(regionCode) {
    super(`No panoramas left to try for ${regionCode}`);
    this.name = 'DryPoolError';
    this.regionCode = regionCode;
  }
}

/**
 * An upstream service did not answer usefully.
 *
 * `code` says how, so a route can choose the status and the copy: 'auth' is
 * a misconfiguration that no retry fixes, 'timeout' and 'network' are the
 * service or the path to it, 'http' is an answer that was an error, and 'gone'
 * is the service saying the image asked for does not exist or cannot be shown.
 */
export class UpstreamError extends Error {
  /**
   * @param {'auth'|'timeout'|'network'|'http'|'gone'} code What went wrong.
   * @param {string} message Detail for the logs.
   * @param {number|null} [status] The HTTP status, for code 'http'.
   */
  constructor(code, message, status = null) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
    this.status = status;
  }
}

/** True for an authentication failure, which retrying cannot fix. */
export function isAuthFailure(error) {
  return error instanceof UpstreamError && error.code === 'auth';
}

/**
 * True for a failure that says nothing about the thing asked for: the service
 * was slow, unreachable, overloaded or rate-limiting. The same request may
 * well succeed a moment later, so it is no evidence the image is gone.
 */
export function isTransient(error) {
  if (!(error instanceof UpstreamError)) return false;
  if (error.code === 'timeout' || error.code === 'network') return true;
  return error.code === 'http' && (error.status >= 500 || error.status === 429);
}

/**
 * True when the service answered and said the image is not there to show:
 * deleted, never existed, or missing a displayable rendition. This is proof
 * about the image, unlike a transient failure, and the only kind of failure
 * that justifies choosing a different panorama for a round that must stay the
 * same for everyone.
 */
export function isImageGone(error) {
  return error instanceof UpstreamError && error.code === 'gone';
}
