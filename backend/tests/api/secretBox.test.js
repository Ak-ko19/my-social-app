const crypto = require('crypto');
const secretBox = require('../../utils/secretBox');

// Days 114-115: values sealed with TOTP_ENCRYPTION_KEY (utils/secretBox.js).
describe('secretBox', () => {
  const KEY = crypto.randomBytes(32);
  const saved = process.env.TOTP_ENCRYPTION_KEY;
  const useKey = (value) => { process.env.TOTP_ENCRYPTION_KEY = value; };
  afterEach(() => {
    if (saved === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = saved;
  });

  it('without a key: stored as is, and plain values open as they are', () => {
    useKey('');
    expect(secretBox.hasKey()).toBe(false);
    expect(secretBox.seal('JBSWY3DPEHPK3PXP', 'totp:1')).toBe('JBSWY3DPEHPK3PXP');
    expect(secretBox.open('JBSWY3DPEHPK3PXP', 'totp:1')).toBe('JBSWY3DPEHPK3PXP');
    expect(secretBox.seal(null, 'totp:1')).toBeNull();
    expect(secretBox.open(null, 'totp:1')).toBeNull();
  });

  it('with a key (hex or base64): sealed, different every time, and opens back', () => {
    for (const written of [KEY.toString('hex'), KEY.toString('base64'), KEY.toString('base64url')]) {
      useKey(written);
      const a = secretBox.seal('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'totp:7');
      const b = secretBox.seal('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'totp:7');
      expect(a).toMatch(/^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/);
      expect(a).toHaveLength(86); // fits migration 096's varchar(128)
      expect(a).not.toBe(b); // a fresh iv each time
      expect(a).not.toContain('JBSWY3DP');
      expect(secretBox.isSealed(a)).toBe(true);
      expect(secretBox.open(a, 'totp:7')).toBe('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
      expect(secretBox.open('JBSWY3DPEHPK3PXP', 'totp:7')).toBe('JBSWY3DPEHPK3PXP'); // stored before the key
    }
  });

  it('a sealed value opens only for its own account (aad)', () => {
    useKey(KEY.toString('hex'));
    const sealed = secretBox.seal('JBSWY3DPEHPK3PXP', 'totp:7');
    expect(() => secretBox.open(sealed, 'totp:8')).toThrow(secretBox.SecretBoxError);
  });

  it('no key, the wrong key, or changed bytes: an error, never a value', () => {
    useKey(KEY.toString('hex'));
    const sealed = secretBox.seal('JBSWY3DPEHPK3PXP', 'totp:7');

    useKey('');
    expect(() => secretBox.open(sealed, 'totp:7')).toThrow(/TOTP_ENCRYPTION_KEY is not set/);
    useKey(crypto.randomBytes(32).toString('hex'));
    expect(() => secretBox.open(sealed, 'totp:7')).toThrow(/could not be opened/);

    useKey(KEY.toString('hex'));
    const [, iv, tag, data] = sealed.split(':');
    const flip = (s) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    for (const bad of [`v1:${iv}:${tag}:${flip(data)}`, `v1:${iv}:${flip(tag)}:${data}`, `v1:${flip(iv)}:${tag}:${data}`,
      `v1:${iv}:${tag}`, `v1:${iv}:${tag.slice(2)}:${data}`, 'v1:', `v1:${iv}:${tag}:${data}:x`]) {
      expect(() => secretBox.open(bad, 'totp:7')).toThrow(secretBox.SecretBoxError);
    }
  });

  it('parseKey: unset is null; anything but 32 bytes is refused, without echoing it', () => {
    expect(secretBox.parseKey(undefined)).toBeNull();
    expect(secretBox.parseKey('  ')).toBeNull();
    expect(secretBox.parseKey(KEY.toString('hex'))).toEqual(KEY);
    expect(secretBox.parseKey(KEY.toString('base64'))).toEqual(KEY);
    for (const bad of ['short', KEY.toString('hex').slice(1), crypto.randomBytes(31).toString('base64'), 'é'.repeat(44)]) {
      let message = '';
      try { secretBox.parseKey(bad); } catch (err) { message = err.message; }
      expect(message).toMatch(/must be 32 random bytes/);
      expect(message).not.toContain(bad);
    }
    // A malformed key set in the environment: sealing fails loudly, never stores plain.
    useKey('not-a-key');
    expect(() => secretBox.seal('JBSWY3DPEHPK3PXP', 'totp:1')).toThrow(/must be 32 random bytes/);
  });
});
