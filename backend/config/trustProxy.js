// How many reverse proxies sit in front of this server, for Express's
// `trust proxy` setting. It decides what `req.ip` is, and every rate
// limiter keys on `req.ip`.
//
// Without it, behind Render's proxy `req.ip` is the proxy's own address,
// so all clients share one limiter bucket: five wrong passwords from
// anyone would lock everyone out of login.
//
// A hop count, never `true`: with N hops Express takes the Nth address from
// the right of X-Forwarded-For, which the proxy itself appended, so entries
// a client prepends to spoof its IP are ignored. `true` would trust the
// whole header and let a client choose its own IP.
//
// - TRUST_PROXY set: a non-negative integer hop count (0 = off).
// - Otherwise: 1 hop on Render (it sets RENDER=true on every service) or
//   in production; off in local dev, where nothing sits in front.
function resolveTrustProxy(env) {
  const raw = env.TRUST_PROXY;
  if (raw !== undefined && raw.trim() !== '') {
    const value = raw.trim();
    if (!/^\d+$/.test(value)) {
      throw new Error(
        `TRUST_PROXY must be a whole number of proxy hops (e.g. 1), got "${raw}".`
      );
    }
    const hops = Number(value);
    return hops === 0 ? false : hops;
  }
  if (env.RENDER === 'true' || env.NODE_ENV === 'production') return 1;
  return false;
}

module.exports = { resolveTrustProxy };
