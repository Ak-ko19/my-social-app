// Day 85: an id in a URL path is a whole number from 1 to the database's
// integer limit. Before this, "1.5" and "1e3" passed the routes' isNaN
// checks and "99999999999" was out of range -- each a server error (500)
// in the query, on 75 routes (found by tests/api/inputTypes.test.js).
// Registered per router with router.param, for the names that are always
// integers (a profile's :id may also be a username, a session's a UUID,
// so those routers leave `id` out).
//
// Only numeric-looking values are refused here, with one generic 400;
// text such as "abc" still reaches the route's own check and message.
const MAX_INT = 2147483647;
const WHOLE = /^[1-9]\d{0,9}$/;
const NUMERIC_LOOKING = /^[-+]?[\d.]|^0x/i;

const INVALID = 'Invalid ID';

function isWholeId(value) {
  return WHOLE.test(value) && Number(value) <= MAX_INT;
}

function checkWholeId(req, res, next, value) {
  const text = String(value);
  if (!isWholeId(text) && NUMERIC_LOOKING.test(text)) return res.status(400).send(INVALID);
  return next();
}

const INTEGER_PARAMS = ['id', 'userId', 'messageId', 'followerId'];

function wholeIds(router, names = INTEGER_PARAMS) {
  for (const name of names) router.param(name, checkWholeId);
  return router;
}

module.exports = { wholeIds, isWholeId, INTEGER_PARAMS };
