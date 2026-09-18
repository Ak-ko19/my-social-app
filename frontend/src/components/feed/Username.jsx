// Kept as its own component per the requested architecture — currently just
// a styled label, but gives future feeds (profile/search/community) a single
// place to add a profile link once that route exists.
function Username({ children }) {
  return <strong className="feed-username">{children}</strong>;
}

export default Username;
