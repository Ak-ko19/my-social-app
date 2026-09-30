// Day 10: structured logging. The one place the backend writes logs.
//
// Production: one JSON object per line -- {"level","time","msg",...} -- so
// Render's log search can filter by level, route, user or request id.
// Local dev: short readable lines.
//
// Callers choose the fields, so secrets never get here by accident. An
// error is reduced to name/message/stack/code: pg's `detail` (which can
// contain row values such as an email address) is deliberately left out.
const { isProduction } = require('../config/runtime');

function serializeError(err) {
  if (!err || typeof err !== 'object') return { message: String(err) };
  const out = { name: err.name, message: err.message };
  if (err.code) out.code = err.code;
  if (err.stack) out.stack = err.stack;
  return out;
}

function write(level, msg, fields = {}) {
  const { err, ...rest } = fields;
  let line;
  if (isProduction()) {
    const entry = { level, time: new Date().toISOString(), msg, ...rest };
    if (err !== undefined) entry.err = serializeError(err);
    line = JSON.stringify(entry);
  } else {
    const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    const errText = err !== undefined ? `\n  ${(err && err.stack) || serializeError(err).message}` : '';
    line = `[${level}] ${msg}${extras}${errText}`;
  }
  // The one sanctioned console call: info -> stdout, warn/error -> stderr.
  console[level === 'info' ? 'log' : level](line);
}

module.exports = {
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
  serializeError
};
