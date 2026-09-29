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
// their sessions and cuts off pre-sessions tokens.
async function revokeOtherSessions(userId, keepSid) {
  await db.query(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)',
    [userId, keepSid || null]
  );
  await db.query('UPDATE users SET tokens_valid_after = now() WHERE id = $1', [userId]);
}

// Revoked sessions' live sockets would otherwise stay connected (sockets
// are only authorized when they connect).
async function disconnectOtherSockets(userId, keepSid) {
  // Lazy require: sockets/ -> socketAuth -> this module would be circular.
  const { getIO } = require('../sockets');
  let io;
  try {
    io = getIO();
  } catch {
    return; // no socket server running (API tests, scripts)
  }
  const sockets = await io.in(`user_${userId}`).fetchSockets();
  for (const socket of sockets) {
    if (!keepSid || socket.data.sessionId !== keepSid) socket.disconnect(true);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

module.exports = { createSession, authorize, revokeOtherSessions, disconnectOtherSockets, TOKEN_TTL_SECONDS };
