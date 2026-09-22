import { renderTextWithLinks } from '../../utils/renderTextWithLinks';

// Renders post content with #hashtags linked to /hashtag/:tag and @mentions
// linked to /profile/:username. Plain text otherwise -- used by PostCard
// for the post body.
function PostText({ content, className }) {
  return <p className={className}>{renderTextWithLinks(content)}</p>;
}

export default PostText;
