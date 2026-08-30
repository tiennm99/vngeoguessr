// In-memory stand-in for the @upstash/redis client.
//
// The real client speaks HTTP REST, not RESP, so a plain Redis container cannot
// serve it without an extra proxy in front. The app only touches nine commands
// over strings and sorted sets, so a faithful in-memory implementation is both
// simpler to run and enough to exercise every path in lib/upstash.js.
//
// Semantics deliberately mirror Redis where the app depends on them:
//   - sorted sets order by score ascending, ties broken by member lexicographically
//   - zrange/zremrangebyrank take inclusive indices and accept negative offsets
//   - zrange REV reverses the index space, so 0 is the highest score
//   - keys with an elapsed TTL read back as missing

const instances = [];

/** Resolve a possibly-negative inclusive index pair against a list length. */
function resolveRange(length, start, stop) {
  let from = start < 0 ? length + start : start;
  let to = stop < 0 ? length + stop : stop;
  if (from < 0) from = 0;
  if (to >= length) to = length - 1;
  return { from, to };
}

/** Order sorted-set entries the way Redis does: by score, then by member. */
function sortEntries(entries) {
  return [...entries].sort((a, b) =>
    a.score === b.score ? a.member.localeCompare(b.member) : a.score - b.score
  );
}

export class FakeRedis {
  constructor(config = {}) {
    this.config = config;
    // key -> { value, expireAt } for strings, key -> Map<member, score> for zsets.
    this.strings = new Map();
    this.zsets = new Map();
    // Set by tests that need zrange to answer in the older array-of-objects
    // shape instead of the flat [member, score, ...] the current SDK returns.
    this.withScoresShape = 'flat';
    instances.push(this);
  }

  /** Clear every store handed out so far. Call between tests. */
  static resetAll() {
    for (const instance of instances) {
      instance.strings.clear();
      instance.zsets.clear();
      instance.withScoresShape = 'flat';
    }
  }

  /** The client most recently constructed, for store-level assertions. */
  static latest() {
    return instances[instances.length - 1];
  }

  async get(key) {
    const entry = this.strings.get(key);
    if (!entry) return null;
    if (entry.expireAt != null && Date.now() >= entry.expireAt) {
      this.strings.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, opts) {
    const expireAt = opts?.ex != null ? Date.now() + opts.ex * 1000 : null;
    this.strings.set(key, { value, expireAt });
    return 'OK';
  }

  /** Remaining TTL in seconds, mirroring Redis: -2 missing, -1 no expiry. */
  async ttl(key) {
    const entry = this.strings.get(key);
    if (!entry) return -2;
    if (entry.expireAt == null) return -1;
    return Math.ceil((entry.expireAt - Date.now()) / 1000);
  }

  async del(key) {
    const had = this.strings.delete(key);
    const hadZset = this.zsets.delete(key);
    return had || hadZset ? 1 : 0;
  }

  /**
   * Cursor-based key scan.
   *
   * Returns everything in one page: the store is in-memory, so a real cursor
   * would only add a loop the tests cannot meaningfully exercise. Callers still
   * have to handle the cursor protocol, because the real client does paginate.
   */
  async scan(cursor, opts = {}) {
    const keys = [...this.strings.keys(), ...this.zsets.keys()];
    const live = keys.filter((key) => !this.#expired(key));
    if (!opts.match) return ['0', live];

    // Redis glob: * spans any run of characters, ? one. Everything else in the
    // pattern is literal, so escape it before substituting the wildcards.
    const escaped = opts.match.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    return ['0', live.filter((key) => pattern.test(key))];
  }

  /** True when a string key's TTL has elapsed. Sorted sets never expire here. */
  #expired(key) {
    const entry = this.strings.get(key);
    return Boolean(entry?.expireAt && entry.expireAt <= Date.now());
  }

  async zadd(key, { score, member }) {
    let zset = this.zsets.get(key);
    if (!zset) {
      zset = new Map();
      this.zsets.set(key, zset);
    }
    const isNew = !zset.has(member);
    zset.set(member, score);
    return isNew ? 1 : 0;
  }

  async zscore(key, member) {
    const zset = this.zsets.get(key);
    if (!zset || !zset.has(member)) return null;
    return zset.get(member);
  }

  async zrange(key, start, stop, opts = {}) {
    const ordered = this.#ordered(key, opts.rev);
    const { from, to } = resolveRange(ordered.length, start, stop);
    const slice = from > to ? [] : ordered.slice(from, to + 1);

    if (!opts.withScores) return slice.map((entry) => entry.member);
    if (this.withScoresShape === 'objects') {
      return slice.map((entry) => ({ member: entry.member, score: entry.score }));
    }
    return slice.flatMap((entry) => [entry.member, entry.score]);
  }

  async zrank(key, member) {
    const index = this.#ordered(key, false).findIndex((e) => e.member === member);
    return index === -1 ? null : index;
  }

  async zrevrank(key, member) {
    const index = this.#ordered(key, true).findIndex((e) => e.member === member);
    return index === -1 ? null : index;
  }

  async zremrangebyrank(key, start, stop) {
    const ordered = this.#ordered(key, false);
    const { from, to } = resolveRange(ordered.length, start, stop);
    if (from > to) return 0;

    const zset = this.zsets.get(key);
    const doomed = ordered.slice(from, to + 1);
    for (const entry of doomed) zset.delete(entry.member);
    return doomed.length;
  }

  /** Sorted-set contents in rank order, newest sort applied on every read. */
  #ordered(key, rev) {
    const zset = this.zsets.get(key);
    if (!zset) return [];
    const ordered = sortEntries(
      [...zset.entries()].map(([member, score]) => ({ member, score }))
    );
    return rev ? ordered.reverse() : ordered;
  }
}
