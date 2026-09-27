import { renderTextWithLinks } from '../../utils/renderTextWithLinks';

// Renders post content with #hashtags linked to /hashtag/:tag and @mentions
// linked to /profile/:username. Plain text otherwise -- used by PostCard
// for the post body.
function PostText({ content, className }) {
  // dir="auto": the post keeps its own writing direction in any UI language (B16).
  return <p className={className} dir="auto">{renderTextWithLinks(content)}</p>;
}

export default PostText;
