// Day 36: how a profile link is shown -- "shop.example.org/tea", no scheme
// or "www.", at most 40 characters.
export function linkLabel(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  const rest = `${u.pathname === '/' ? '' : u.pathname}${u.search}`;
  const label = `${host}${rest}`;
  return label.length > 40 ? `${label.slice(0, 39)}…` : label;
}
