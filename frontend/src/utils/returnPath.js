// Day 30: where to go after logging in -- the page RequireAuth saved, if it
// is a path inside this app; otherwise Home. "//host" and "/\host" are
// protocol-relative URLs to another site in browsers, so they don't count.
export function safeReturnPath(from) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return '/';
  if (from === '/login' || from.startsWith('/login?')) return '/';
  return from;
}
