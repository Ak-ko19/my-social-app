// Day 75: a request field that should be text, or '' when it isn't. A JSON
// body can carry anything -- an object or an array where a handler expects
// an email or a password -- and `(req.body.email || '').trim()` then throws
// (a 500, and a row in Admin > Errors, on routes anyone can call). With
// this the handler's own "is required" answer covers it instead.
function textOf(value) {
  return typeof value === 'string' ? value : '';
}

module.exports = { textOf };
