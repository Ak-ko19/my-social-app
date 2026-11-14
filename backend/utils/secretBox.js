// Days 114-115: secrets kept in the database, sealed with a key the server
// holds and the database never sees (first user: two-factor keys,
// services/twoFactorService.js). If someone gets a copy of the database
// (a leaked backup, a stolen dump), the sealed values are useless without
// the key.
//
// The key: TOTP_ENCRYPTION_KEY, 32 random bytes written as 64 hex
// characters or as base64. Optional -- without it values are stored as
// they are (as before), and config/env.js refuses to start with a key
// that isn't 32 bytes. How to make one: backend/.env.example (32 bytes of
// crypto.randomBytes, as base64); the owner's steps: LATER.md #9.
//
// Format: "v1:<iv>:<tag>:<data>" (base64url), AES-256-GCM with a fresh
// 12-byte iv each time. The "v1:" leaves room for a new key or algorithm
// later. `aad` ties a sealed value to where it belongs (e.g. one user's
// two-factor key): copied anywhere else, it won't open.
//
// open() of a value that isn't sealed returns it unchanged, so values
// written before the key was set keep working (and get sealed on their
// next use). A sealed value with no key, the wrong key, or changed bytes
// is a SecretBoxError: a server error, never "no secret".
const crypto = require('crypto');

const PREFIX = 'v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

class SecretBoxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

const HEX_KEY = /^[0-9a-fA-F]{64}$/;
const BASE64_KEY = /^[A-Za-z0-9+/_-]+={0,2}$/;

// The key's bytes, or null when the variable is unset. Throws on a value
// that is set but isn't 32 bytes (the message never includes the value).
function parseKey(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const text = value.trim();
  let key = null;
  if (HEX_KEY.test(text)) key = Buffer.from(text, 'hex');
  else if (BASE64_KEY.test(text)) key = Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!key || key.length !== KEY_BYTES) {
    throw new SecretBoxError('TOTP_ENCRYPTION_KEY must be 32 random bytes, written as 64 hex characters or as base64.');
  }
  return key;
}

const currentKey = () => parseKey(process.env.TOTP_ENCRYPTION_KEY);

function hasKey() {
  return currentKey() !== null;
}

function isSealed(stored) {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

// Sealed when a key is set; as is otherwise. null/undefined stay as they are.
function seal(plain, aad) {
  if (plain === null || plain === undefined) return plain;
  const key = currentKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(aad), 'utf8'));
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;
}

function open(stored, aad) {
  if (!isSealed(stored)) return stored;
  const key = currentKey();
  if (!key) throw new SecretBoxError('A sealed secret was found but TOTP_ENCRYPTION_KEY is not set.');
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new SecretBoxError('A sealed secret is damaged.');
  const [iv, tag, data] = parts.map((p) => Buffer.from(p, 'base64url'));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretBoxError('A sealed secret is damaged.');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(String(aad), 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretBoxError('A sealed secret could not be opened (wrong TOTP_ENCRYPTION_KEY, or the value was changed).');
  }
}

module.exports = { seal, open, isSealed, hasKey, parseKey, SecretBoxError };
