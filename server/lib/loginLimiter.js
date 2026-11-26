// In-memory login attempt limiting (Phase 7), without extra packages.
//
// - Same email + same IP address: after MAX_FAILURES failed logins within
//   WINDOW_MS, that pair is blocked for BLOCK_MS. Blocks are always
//   temporary and a successful login clears the counter.
// - Same IP address across many emails: never blocked (hospital staff often
//   share one public address). Instead, once SLOWDOWN_AFTER failures from
//   that address occur within WINDOW_MS, every login attempt from it is
//   delayed by SLOWDOWN_MS, which makes mass guessing slow while staff with
//   the correct password can still sign in.
// State is kept in memory, so it resets when the server restarts.

function createLoginLimiter({
  maxFailures = 5,
  slowdownAfter = 30,
  slowdownMs = 2000,
  windowMs = 15 * 60 * 1000,
  blockMs = 15 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const pairs = new Map(); // `${ip}|${email}` -> { failures, windowStart, blockedUntil }
  const addresses = new Map(); // ip -> { failures, windowStart }

  function current(map, key) {
    const time = now();
    let entry = map.get(key);

    if (!entry || (time - entry.windowStart > windowMs && !(entry.blockedUntil > time))) {
      entry = { failures: 0, windowStart: time, blockedUntil: 0 };
      map.set(key, entry);
    }

    return entry;
  }

  // Seconds to wait before this email may be tried again from this
  // address, or 0 if the attempt may proceed.
  function retryAfterSeconds(ip, email) {
    const entry = pairs.get(`${ip}|${email}`);
    const time = now();

    return entry && entry.blockedUntil > time
      ? Math.ceil((entry.blockedUntil - time) / 1000)
      : 0;
  }

  // Milliseconds to delay a login attempt from this address (0 normally).
  function delayMs(ip) {
    const entry = addresses.get(ip);

    if (!entry || now() - entry.windowStart > windowMs) return 0;

    return entry.failures >= slowdownAfter ? slowdownMs : 0;
  }

  function recordFailure(ip, email) {
    const pair = current(pairs, `${ip}|${email}`);
    pair.failures += 1;

    if (pair.failures >= maxFailures) {
      pair.blockedUntil = now() + blockMs;
      pair.failures = 0;
      pair.windowStart = now();
    }

    current(addresses, ip).failures += 1;

    // Keep memory bounded: drop expired entries occasionally.
    if (pairs.size + addresses.size > 10000) {
      const time = now();

      for (const map of [pairs, addresses]) {
        for (const [key, entry] of map) {
          if (!(entry.blockedUntil > time) && time - entry.windowStart > windowMs) {
            map.delete(key);
          }
        }
      }
    }
  }

  function recordSuccess(ip, email) {
    pairs.delete(`${ip}|${email}`);
  }

  return { delayMs, recordFailure, recordSuccess, retryAfterSeconds };
}

module.exports = { createLoginLimiter };
