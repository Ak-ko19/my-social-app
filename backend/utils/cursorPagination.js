// Keyset (cursor) pagination for message history: offset-based paging gets
// slower and can skip/duplicate rows as new messages arrive between page
// requests. The cursor opaquely names the last row a client has seen, so the
// next page can resume with a plain indexed WHERE (created_at, id) < (that
// row's) instead of OFFSET. Day 70: only the id travels -- the query reads
// the row's own created_at, because Postgres keeps microseconds and a JS
// Date only milliseconds (a timestamp in the cursor skipped messages sent
// within the same millisecond). Older cursors, which also carried
// createdAt, still work by their id.
function encodeCursor({ id }) {
  return Buffer.from(JSON.stringify({ id })).toString('base64');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    if (!Number.isInteger(parsed?.id) || parsed.id < 1) {
      throw new Error('malformed cursor');
    }
    return { id: parsed.id };
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
