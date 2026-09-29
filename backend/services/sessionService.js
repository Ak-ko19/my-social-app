// Login sessions (migration 028). Each login creates a row; its id (a UUID)
// is the JWT's "sid" claim, and every authenticated request -- REST,
// optional-auth reads and socket connections -- asks authorize() whether
// the token still counts. That's what lets a password change sign other
// devices out; a bare 7-day JWT can't be taken back.
//
// Tokens issued before sessions existed have no sid. They stay valid until
// they expire, unless users.tokens_valid_after says otherwise (set by a
// password change or reset), so deploying this logs nobody out.
const jwt = require('jsonwebtoken');
const db = require('../db');

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // same 7 days as before

async function createSession(userId, req) {
  const userAgent = (req.headers['user-agent'] || '').slice(0, 500) || null;
  const result = await db.query(
    `INSERT INTO sessions (user_id, expires_at, user_agent)
     VALUES ($1, now() + make_interval(secs => $2), $3) RETURNING id`,
    [userId, TOKEN_TTL_SECONDS, userAgent]
  );
  const sid = result.rows[0].id;
  const token = jwt.sign({ userId, sid }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
  return { sid, token };
}

// 'ok' | 'banned' | 'invalid' for an already signature-checked token. One
// query covers the ban check (which every auth path already paid for) and
// the session check.
async function authorize(decoded) {
  if (!decoded || !decoded.userId) return 'invalid';
  const result = await db.query(
    `SELECT u.banned_at, u.tokens_valid_after,
            s.id AS sid, s.revoked_at, s.expires_at < now() AS expired
     FROM users u
     LEFT JOIN sessions s ON s.id = $2 AND s.user_id = u.id
     WHERE u.id = $1`,
    // A malformed sid must not reach the uuid comparison (it would throw).
    [decoded.userId, isUuid(decoded.sid) ? decoded.sid : null]
  );
  const row = result.rows[0];
  if (!row) return 'invalid';
  if (row.banned_at) return 'banned';
  if (decoded.sid !== undefined) {
    return row.sid && !row.revoked_at && !row.expired ? 'ok' : 'invalid';
  }
  // Pre-sessions token: dead if issued at or before tokens_valid_after.
  if (row.tokens_valid_after && decoded.iat * 1000 <= row.tokens_valid_after.getTime()) return 'invalid';
  return 'ok';
}

// Signs out every device except `keepSid` (null = all of them): revokes
// their sessions and cuts off pre-sessions tokens. Returns how many
// sessions were revoked.
async function revokeOtherSessions(userId, keepSid) {
  const result = await db.query(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)',
    [userId, keepSid || null]
  );
  await db.query('UPDATE users SET tokens_valid_after = now() WHERE id = $1', [userId]);
  return result.rowCount;
}

// A user's live sockets. Revoked sessions' sockets must be disconnected by
// hand: sockets are only authorized when they connect.
async function userSockets(userId) {
  // Lazy require: sockets/ -> socketAuth -> this module would be circular.
  const { getIO } = require('../sockets');
  let io;
  try {
    io = getIO();
  } catch {
    return []; // no socket server running (API tests, scripts)
  }
  return io.in(`user_${userId}`).fetchSockets();
}

async function disconnectOtherSockets(userId, keepSid) {
  for (const socket of await userSockets(userId)) {
    if (!keepSid || socket.data.sessionId !== keepSid) socket.disconnect(true);
  }
}

// The live sockets of one session (after signing out that one device).
async function disconnectSession(userId, sid) {
  for (const socket of await userSockets(userId)) {
    if (socket.data.sessionId === sid) socket.disconnect(true);
  }
}

// last_seen_at for the sessions list, written at most every 5 minutes per
// session so an active user doesn't cause a write on every request.
async function touchSession(sid) {
  await db.query(
    "UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'",
    [sid]
  );
}

// "Chrome" / "Windows" / "desktop" from a user agent -- just enough to
// recognise your own devices in the list (null when unknown). Order
// matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
function describeDevice(userAgent) {
  const ua = userAgent || '';
  const browser =
    /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
      : /OPR\/|Opera/.test(ua) ? 'Opera'
        : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
          : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
            : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
              : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
                : null;
  const os =
    /Windows NT/.test(ua) ? 'Windows'
      : /Android/.test(ua) ? 'Android'
        : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
          : /CrOS/.test(ua) ? 'ChromeOS'
            : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
              : /Linux/.test(ua) ? 'Linux'
                : null;
  const kind = /Mobi|Android|iPhone|iPad|iPod/.test(ua) ? 'mobile' : 'desktop';
  return { browser, os, kind };
}

// Active sessions, this device first, then the most recently used.
async function listSessions(userId, currentSid) {
  const result = await db.query(
    `SELECT id, created_at, last_seen_at, user_agent FROM sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY id = $2::uuid DESC NULLS LAST, last_seen_at DESC
     LIMIT 50`,
    [userId, currentSid || null]
  );
  return result.rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    current: row.id === currentSid,
    device: describeDevice(row.user_agent)
  }));
}

// Signs out one of the user's own sessions. false = not found / not theirs.
async function revokeSession(userId, sid) {
  if (!isUuid(sid)) return false;
  const result = await db.query(
    'UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id',
    [sid, userId]
  );
  return result.rows.length > 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

module.exports = {
  createSession,
  authorize,
  revokeOtherSessions,
  disconnectOtherSockets,
  disconnectSession,
  touchSession,
  describeDevice,
  listSessions,
  revokeSession,
  TOKEN_TTL_SECONDS
};
