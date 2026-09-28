// Returns `value` if it is an absolute http(s) URL, otherwise null. Use it
// before putting any URL that came from data (not our own code) into an
// href or src: React doesn't block "javascript:" (or data:) URLs in href,
// so a crafted link would run script when clicked.
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
