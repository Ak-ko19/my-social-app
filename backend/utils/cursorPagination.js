// Keyset (cursor) pagination for message history: offset-based paging gets
// slower and can skip/duplicate rows as new messages arrive between page
// requests. The cursor opaquely encodes the (created_at, id) of the last row
// a client has seen so the next page can resume with a plain indexed
// WHERE (created_at, id) < (cursor) instead of OFFSET.
function encodeCursor({ createdAt, id }) {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    if (!parsed.createdAt || !Number.isInteger(parsed.id)) {
      throw new Error('malformed cursor');
    }
    return parsed;
  } catch (err) {
    throw new Error('Invalid cursor');
  }
}

// Mirrors utils/pagination.js's clamping behaviour, just for a limit-only
// (no page number) query param.
function getLimit(req, { defaultLimit = 20, maxLimit = 100 } = {}) {
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  return limit;
}

module.exports = { encodeCursor, decodeCursor, getLimit };
