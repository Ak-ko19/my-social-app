import { Link } from 'react-router-dom';
import { URL_PATTERN, trimLink } from './links';
import { safeHttpUrl } from './safeUrl';

// Same regex shape as the backend's hashtagService.parseHashtags/
// mentionService.parseMentionUsernames (\w+ after # or @), but this only
// needs to SPLIT the text for rendering, not validate/normalize for
// storage -- an all-digit "#123" or a mention of a since-deleted user still
// renders as a link here (it just won't resolve to anything server-side,
// same as searching for a tag/user that doesn't exist).
// Day 19: web links come first, so a "#fragment" inside a URL stays part
// of the URL rather than becoming a hashtag.
const TOKEN_SPLIT_REGEX = new RegExp(`(${URL_PATTERN.source}|#\\w+|@\\w+)`, 'gi');
const STARTS_WITH_SCHEME = /^https?:\/\//i;

// An external link: opens in a new tab, tells the site nothing about us
// (noreferrer) and that we don't vouch for it (nofollow ugc). A plain
// function, not a component, so this file only exports a function (see
// the Fast Refresh note below).
function webLink(raw, key) {
  const text = trimLink(raw);
  const rest = raw.slice(text.length);
  const href = safeHttpUrl(text);
  if (!href) return <span key={key}>{raw}</span>;
  return (
    <span key={key}>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="post-text-link" onClick={(e) => e.stopPropagation()}>
        {/* <bdi dir="ltr">: a URL always reads left to right, even in Arabic text. */}
        <bdi dir="ltr">{text}</bdi>
      </a>
      {rest}
    </span>
  );
}

// Converts web links to external links, #hashtags to /hashtag/:tag links
// and @mentions to /profile/:username links, everything else passed through
// as plain text. Used by PostText (post body), CommentSection (comment
// body) and -- links only (tags: false) -- message bubbles. Lives outside
// components/ (not a component itself, just returns an array of nodes) so
// files that only export components keep Fast Refresh working.
export function renderTextWithLinks(content, { tags = true } = {}) {
  const parts = content.split(TOKEN_SPLIT_REGEX);
  return parts.map((part, i) => {
    if (STARTS_WITH_SCHEME.test(part)) return webLink(part, i);
    if (tags && part.length > 1 && (part[0] === '#' || part[0] === '@')) {
      const name = part.slice(1);
      const to = part[0] === '#' ? `/hashtag/${name.toLowerCase()}` : `/profile/${name}`;
      const linkClass = part[0] === '#' ? 'post-text-hashtag' : 'post-text-mention';
      return (
        <Link key={i} to={to} className={linkClass} onClick={(e) => e.stopPropagation()}>
          {/* <bdi>: keeps "#tag"/"@name" in order inside right-to-left text (B16). */}
          <bdi>{part}</bdi>
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
