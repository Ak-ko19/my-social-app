const jwt = require('jsonwebtoken');
const { createLimiter, rateLimitKeys } = require('../../middleware/rateLimiter');

const { ipKey, userKey, userOrIpKey } = rateLimitKeys;

// Day 2: logged-in traffic is limited per account (many users can share one
// IP), anonymous traffic per IP.
function req({ ip = '203.0.113.7', authorization, userId } = {}) {
  return { ip, headers: authorization ? { authorization } : {}, userId };
}

const tokenFor = (userId, secret = process.env.JWT_SECRET, options = {}) =>
  jwt.sign({ userId }, secret, { expiresIn: '7d', ...options });

describe('ipKey', () => {
  it('keys IPv4 clients by address', () => {
    expect(ipKey(req({ ip: '203.0.113.7' }))).toBe('ip:203.0.113.7');
    expect(ipKey(req({ ip: '203.0.113.8' }))).not.toBe(ipKey(req({ ip: '203.0.113.7' })));
  });

  it('groups one IPv6 host\'s addresses (/56) so rotating them doesn\'t help', () => {
    expect(ipKey(req({ ip: '2001:db8:1:2::1' }))).toBe(ipKey(req({ ip: '2001:db8:1:3::99' })));
    expect(ipKey(req({ ip: '2001:db8:1:2::1' }))).not.toBe(ipKey(req({ ip: '2001:db8:2:2::1' })));
  });
});

describe('userKey (behind authMiddleware)', () => {
  it('keys by the authenticated user, whatever the IP', () => {
    expect(userKey(req({ userId: 42, ip: '203.0.113.1' }))).toBe('user:42');
    expect(userKey(req({ userId: 42, ip: '198.51.100.9' }))).toBe('user:42');
  });

  it('falls back to the IP instead of one shared "user:undefined" bucket', () => {
    expect(userKey(req({ ip: '203.0.113.7' }))).toBe('ip:203.0.113.7');
  });
});

describe('userOrIpKey (global limiter, runs before auth)', () => {
  it('uses the user from a valid token', () => {
    expect(userOrIpKey(req({ authorization: `Bearer ${tokenFor(5)}` }))).toBe('user:5');
  });

  it('gives two users behind one IP separate buckets', () => {
    const a = userOrIpKey(req({ authorization: `Bearer ${tokenFor(1)}` }));
    const b = userOrIpKey(req({ authorization: `Bearer ${tokenFor(2)}` }));
    expect(a).not.toBe(b);
    expect(userOrIpKey(req())).toBe('ip:203.0.113.7');
  });

  it('never trusts a token it cannot verify', () => {
    const forged = tokenFor(999, 'attacker-secret');
    const expired = tokenFor(5, process.env.JWT_SECRET, { expiresIn: -10 });
    const unsigned = jwt.sign({ userId: 5 }, '', { algorithm: 'none' });
    for (const authorization of [
      `Bearer ${forged}`,
      `Bearer ${expired}`,
      `Bearer ${unsigned}`,
      'Bearer not-a-jwt',
      'Bearer ',
      `Basic ${tokenFor(5)}`,
      tokenFor(5)
    ]) {
      expect(userOrIpKey(req({ authorization }))).toBe('ip:203.0.113.7');
    }
  });

  it('keeps user and IP keys apart even when they look alike', () => {
    expect(userOrIpKey(req({ authorization: `Bearer ${tokenFor(7)}` }))).not.toBe(ipKey(req({ ip: '7' })));
  });
});

describe('createLimiter', () => {
  it('requires a known keyBy, so no limiter silently falls back to a default key', () => {
    const base = { windowMs: 1000, max: 1, message: 'x' };
    expect(() => createLimiter(base)).toThrow(/keyBy must be one of ip, user, userOrIp/);
    expect(() => createLimiter({ ...base, keyBy: 'session' })).toThrow(/keyBy/);
    expect(typeof createLimiter({ ...base, keyBy: 'user' })).toBe('function');
  });
});
