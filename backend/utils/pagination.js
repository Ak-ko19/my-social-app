// Centralizes page/limit parsing so every list endpoint clamps consistently:
// negative/zero values fall back to sane defaults, and limit is capped so a
// client can't force an unbounded scan/response with e.g. ?limit=999999.
function getPagination(req, { defaultLimit = 10, maxLimit = 50 } = {}) {
  let page = parseInt(req.query.page, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

module.exports = { getPagination };
