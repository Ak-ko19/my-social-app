// Day 74: API answers are personal (a feed, messages, notifications) or
// change from one second to the next, and without a Cache-Control header a
// browser may keep them in its disk cache -- readable by the next person on
// a shared computer, and out of reach of logout, which can only wipe what
// the app stored itself. So every response is `no-store` unless its route
// says otherwise: the few that are the same for everyone (/config, the push
// key, share cards, the API docs) and link previews (a public page's title,
// kept privately for an hour) set their own header after this one, and
// keep Express's ETag, so a repeat visit is a 304 without the body.
function noStoreByDefault(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { noStoreByDefault };
