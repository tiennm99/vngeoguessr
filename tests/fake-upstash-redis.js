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
    // key -> Map<field, number> for hashes, key -> Set<member> for HyperLogLogs.
    this.hashes = new Map();
    this.hlls = new Map();
    // key -> epoch ms for TTLs set with EXPIRE on a non-string key.
    this.expiries = new Map();
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
      instance.hashes.clear();
      instance.hlls.clear();
      instance.expiries.clear();
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
    if (entry) {
      if (entry.expireAt == null) return -1;
      return Math.ceil((entry.expireAt - Date.now()) / 1000);
    }
    if (!this.#exists(key)) return -2;
    const expireAt = this.expiries.get(key);
    if (expireAt == null) return -1;
    return Math.ceil((expireAt - Date.now()) / 1000);
  }

  /** Set a TTL on any key type. Returns 1 when the key exists, as Redis does. */
  async expire(key, seconds) {
    if (this.strings.has(key)) {
      this.strings.get(key).expireAt = Date.now() + seconds * 1000;
      return 1;
    }
    if (!this.#exists(key)) return 0;
    this.expiries.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async del(key) {
    const had = this.strings.delete(key);
    const hadZset = this.zsets.delete(key);
    const hadHash = this.hashes.delete(key);
    const hadHll = this.hlls.delete(key);
    this.expiries.delete(key);
    return had || hadZset || hadHash || hadHll ? 1 : 0;
  }

  async hincrby(key, field, increment) {
    this.#dropIfExpired(key);
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    const next = (hash.get(field) ?? 0) + increment;
    hash.set(field, next);
    return next;
  }

  async hgetall(key) {
    this.#dropIfExpired(key);
    const hash = this.hashes.get(key);
    if (!hash || hash.size === 0) return null;
    return Object.fromEntries(hash);
  }

  async pfadd(key, ...members) {
    this.#dropIfExpired(key);
    let hll = this.hlls.get(key);
    if (!hll) {
      hll = new Set();
      this.hlls.set(key, hll);
    }
    const before = hll.size;
    for (const member of members) hll.add(member);
    return hll.size > before ? 1 : 0;
  }

  async pfcount(...keys) {
    const union = new Set();
    for (const key of keys) {
      this.#dropIfExpired(key);
      for (const member of this.hlls.get(key) ?? []) union.add(member);
    }
    return union.size;
  }

  /** Whether a non-string key holds anything. */
  #exists(key) {
    return this.zsets.has(key) || this.hashes.has(key) || this.hlls.has(key);
  }

  /** Remove a non-string key whose EXPIRE has elapsed, so it reads as missing. */
  #dropIfExpired(key) {
    const expireAt = this.expiries.get(key);
    if (expireAt != null && Date.now() >= expireAt) {
      this.zsets.delete(key);
      this.hashes.delete(key);
      this.hlls.delete(key);
      this.expiries.delete(key);
    }
  }

  /**
   * Cursor-based key scan.
   *
   * Returns everything in one page: the store is in-memory, so a real cursor
   * would only add a loop the tests cannot meaningfully exercise. Callers still
   * have to handle the cursor protocol, because the real client does paginate.
   */
  async scan(cursor, opts = {}) {
    const keys = [
      ...this.strings.keys(),
      ...this.zsets.keys(),
      ...this.hashes.keys(),
      ...this.hlls.keys(),
    ];
    const live = keys.filter((key) => !this.#expired(key));
    if (!opts.match) return ['0', live];

    // Redis glob: * spans any run of characters, ? one. Everything else in the
    // pattern is literal, so escape it before substituting the wildcards.
    const escaped = opts.match.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    return ['0', live.filter((key) => pattern.test(key))];
  }

  /** True when a key's TTL has elapsed. */
  #expired(key) {
    const entry = this.strings.get(key);
    if (entry) return Boolean(entry.expireAt && entry.expireAt <= Date.now());
    const expireAt = this.expiries.get(key);
    return Boolean(expireAt && expireAt <= Date.now());
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

  async zincrby(key, increment, member) {
    let zset = this.zsets.get(key);
    if (!zset) {
      zset = new Map();
      this.zsets.set(key, zset);
    }
    const next = (zset.get(member) ?? 0) + increment;
    zset.set(member, next);
    return next;
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
