// Day 36: the links on a profile (like Instagram's) -- up to MAX_LINKS web
// addresses. Someone typing "example.com" means https://example.com; any
// other scheme (javascript:, data:, mailto:, ...) is refused, and so are
// addresses with a user:password part (a classic way to disguise where a
// link really goes).
const MAX_LINKS = 3;
const MAX_LINK_LENGTH = 200;
const LINKS_ERROR = `Links must be web addresses (up to ${MAX_LINKS}, ${MAX_LINK_LENGTH} characters each)`;

function normalizeLink(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > MAX_LINK_LENGTH || /\s/.test(text)) return null;
  // A scheme is a word with no dot before ':' (https:, javascript:, mailto:);
  // 'example.com:8080' is a host and port, not a scheme.
  const scheme = text.match(/^([a-z][a-z0-9+-]*):/i);
  const withScheme = scheme ? text : `https://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes('.') || url.hostname.endsWith('.')) return null;
  const out = url.toString();
  return out.length > MAX_LINK_LENGTH ? null : out;
}

// The links from a request body: undefined when the field wasn't sent (keep
// what's there); an array of normalized links; or null when invalid.
// Accepts a JSON-encoded array (multipart forms send strings) or an array.
function parseLinks(value) {
  if (value === undefined) return undefined;
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length > MAX_LINKS) return null;
  const links = [];
  for (const raw of list) {
    if (typeof raw === 'string' && raw.trim() === '') continue; // an empty field
    const link = normalizeLink(raw);
    if (!link) return null;
    if (!links.includes(link)) links.push(link);
  }
  return links;
}

module.exports = { parseLinks, normalizeLink, MAX_LINKS, MAX_LINK_LENGTH, LINKS_ERROR };
