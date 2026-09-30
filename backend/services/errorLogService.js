// Day 10: built-in error log. Every server error (and every browser error
// the frontend reports) lands in error_groups -- ONE row per distinct error,
// with a count -- so the admin panel shows what's breaking without an
// outside service. With SENTRY_DSN set, errors also go to Sentry.
//
// report() never throws and callers never await it: logging an error must
// not create a second one. If the database itself is the problem the write
// fails too; that's only printed to the console.
const crypto = require('crypto');
const db = require('../db');
const logger = require('../utils/logger');

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;
const MAX_ROUTE = 200;
// At most one database write per error group per 10 s, so an error storm
// can't hammer the database. Repeats in between are counted in memory and
// written when the 10 s are up (or with the next write, if that's sooner),
// so no occurrence is ever lost.
const WRITE_INTERVAL_MS = 10 * 1000;
const pending = new Map(); // fingerprint -> { lastWrite, extra, timer, entry }

const clip = (value, max) => (value == null ? null : String(value).slice(0, max));

// Volatile parts replaced, so "post 41 not found" and "post 97 not found"
// are one group.
function normalise(message) {
  return String(message)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\d+/g, '<n>');
}

function fingerprintOf(source, route, message) {
  return crypto.createHash('sha1').update(`${source}\n${route || ''}\n${normalise(message)}`).digest('hex');
}

// Sentry, only when SENTRY_DSN is set: required lazily, so without it the
// SDK isn't even loaded.
let sentry;
function getSentry() {
  if (sentry === undefined) {
    sentry = null;
    if (process.env.SENTRY_DSN) {
      try {
        sentry = require('@sentry/node');
        sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
      } catch (err) {
        logger.error('Sentry could not start', { err });
        sentry = null;
      }
    }
  }
  return sentry;
}

async function write({ fingerprint, source, route, message, stack, status, userId }, times) {
  await db.query(
    // The user is linked only if they still exist: the account may have
    // been deleted meanwhile, and that must not lose the error (FK).
    `INSERT INTO error_groups (fingerprint, source, route, message, stack, status, count, last_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM users WHERE id = $8))
     ON CONFLICT (fingerprint) DO UPDATE SET
       count = error_groups.count + EXCLUDED.count,
       last_seen = now(),
       message = EXCLUDED.message,
       stack = COALESCE(EXCLUDED.stack, error_groups.stack),
       status = EXCLUDED.status,
       last_user_id = COALESCE(EXCLUDED.last_user_id, error_groups.last_user_id),
       resolved_at = NULL`,
    [fingerprint, source, route, message, stack, status, times, userId || null]
  );
}

const inFlight = new Set(); // writes still running (see whenIdle)

function save(entry, times) {
  const promise = write(entry, times)
    .catch((writeErr) => {
      logger.error('could not save an error to the log', { err: writeErr });
    })
    .finally(() => inFlight.delete(promise));
  inFlight.add(promise);
}

// Resolves once every error write started so far has finished -- so a
// crashing process can exit right after its report is saved (and tests can
// wait for background writes).
function whenIdle() {
  return Promise.allSettled([...inFlight]);
}

// End of a 10 s window: write the repeats that were held back.
function flush(fingerprint) {
  const state = pending.get(fingerprint);
  if (!state || state.extra === 0) return;
  const times = state.extra;
  state.extra = 0;
  state.timer = null;
  state.lastWrite = Date.now();
  save(state.entry, times);
}

// err: an Error (or anything thrown). context: { source: 'api' | 'socket'
// | 'process' | 'client', route, status, userId, stack (for client
// errors, which arrive as text) }.
function report(err, { source = 'api', route = null, status = null, userId = null, stack } = {}) {
  try {
    const message = clip((err && err.message) || String(err), MAX_MESSAGE) || 'Unknown error';
    const entry = {
      source,
      route: clip(route, MAX_ROUTE),
      message,
      stack: clip(stack !== undefined ? stack : err && err.stack, MAX_STACK),
      status: Number.isInteger(status) ? status : null,
      userId: Number.isInteger(userId) ? userId : null
    };
    entry.fingerprint = fingerprintOf(source, entry.route, message);

    const s = getSentry();
    if (s && source !== 'client') {
      s.captureException(err instanceof Error ? err : new Error(message), {
        tags: { source, route: entry.route || undefined },
        user: entry.userId ? { id: String(entry.userId) } : undefined
      });
    }

    const now = Date.now();
    const state = pending.get(entry.fingerprint);
    if (state && now - state.lastWrite < WRITE_INTERVAL_MS) {
      state.extra += 1;
      state.entry = entry;
      if (!state.timer) {
        state.timer = setTimeout(() => flush(entry.fingerprint), WRITE_INTERVAL_MS - (now - state.lastWrite));
        state.timer.unref?.(); // never keeps the process alive on its own
      }
      return;
    }
    const times = 1 + (state ? state.extra : 0);
    if (state && state.timer) clearTimeout(state.timer); // this write carries the held-back repeats
    if (pending.size > 1000) pending.clear(); // bounded memory under a flood of distinct errors
    pending.set(entry.fingerprint, { lastWrite: now, extra: 0, timer: null, entry });
    save(entry, times);
  } catch (reportErr) {
    logger.error('error log report() failed', { err: reportErr });
  }
}

// At server start: bring Sentry up early (when configured), so it also
// sees errors from the first requests.
function startMonitoring() {
  if (getSentry()) logger.info('Sentry reporting is on');
}

// Tests only: forget throttling state between cases.
function resetThrottle() {
  for (const state of pending.values()) if (state.timer) clearTimeout(state.timer);
  pending.clear();
  sentry = undefined;
}

module.exports = { report, startMonitoring, whenIdle, normalise, fingerprintOf, resetThrottle, MAX_MESSAGE, MAX_STACK };
