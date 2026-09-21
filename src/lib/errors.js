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
 * service or the path to it, 'http' is an answer that was an error.
 */
export class UpstreamError extends Error {
  /**
   * @param {'auth'|'timeout'|'network'|'http'} code What went wrong.
   * @param {string} message Detail for the logs.
   */
  constructor(code, message) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
  }
}

/** True for an authentication failure, which retrying cannot fix. */
export function isAuthFailure(error) {
  return error instanceof UpstreamError && error.code === 'auth';
}
