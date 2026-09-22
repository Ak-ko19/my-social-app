import { Link } from 'react-router-dom';

// Same regex shape as the backend's hashtagService.parseHashtags/
// mentionService.parseMentionUsernames (\w+ after # or @), but this only
// needs to SPLIT the text for rendering, not validate/normalize for
// storage -- an all-digit "#123" or a mention of a since-deleted user still
// renders as a link here (it just won't resolve to anything server-side,
// same as searching for a tag/user that doesn't exist).
const TOKEN_SPLIT_REGEX = /(#\w+|@\w+)/g;

// Converts #hashtags to /hashtag/:tag links and @mentions to
// /profile/:username links, everything else passed through as plain text.
// Used by PostText (post body) and CommentSection (comment body, rendered
// inline inside an existing <p>) so both surfaces render these the same way
// from one place. Lives outside components/ (not a component itself, just
// returns an array of nodes) so files that only export components keep
// Fast Refresh working.
export function renderTextWithLinks(content) {
  const parts = content.split(TOKEN_SPLIT_REGEX);
  return parts.map((part, i) => {
    if (part.length > 1 && (part[0] === '#' || part[0] === '@')) {
      const name = part.slice(1);
      const to = part[0] === '#' ? `/hashtag/${name.toLowerCase()}` : `/profile/${name}`;
      const linkClass = part[0] === '#' ? 'post-text-hashtag' : 'post-text-mention';
      return (
        <Link key={i} to={to} className={linkClass} onClick={(e) => e.stopPropagation()}>
          {part}
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
