import { useNavigate } from 'react-router-dom';
import { Image, Video, Radio } from 'lucide-react';
import { Avatar } from '../ui';
import './PostComposer.css';

// Both the trigger row and Photo open /create-post -- the real, already-
// built post-creation form (content + image upload together), not a
// separate photo-only flow. There isn't one: image upload has only ever
// existed as part of that same form, so "wire Photo to the existing
// upload flow" means the same destination as the trigger, not a new
// mechanism to auto-open its file picker (that would mean touching
// CreatePost.jsx's own logic, which wasn't asked for).
//
// Video/Live are real <button disabled> elements, not just styled to
// look inactive -- genuinely non-functional since neither feature exists
// yet, with a "Coming soon" title as a hover hint.
function PostComposer({ currentUser, className }) {
  const navigate = useNavigate();
  const own = currentUser || { initials: 'ME', bg: 'var(--color-subtle-bg)', color: 'var(--color-text)' };
  const openComposer = () => navigate('/create-post');

  return (
    <div className={className ? `post-composer ${className}` : 'post-composer'}>
      <div className="post-composer-row">
        <Avatar size={38} src={own.avatarUrl} initials={own.initials} bg={own.bg} color={own.color} alt="" />
        <button type="button" className="post-composer-trigger" onClick={openComposer}>
          What&apos;s on your mind?
        </button>
      </div>

      <div className="post-composer-actions">
        <button type="button" className="post-composer-action" onClick={openComposer}>
          <Image size={18} color="var(--badge-green-fg)" aria-hidden="true" />
          <span className="post-composer-action-label">Photo</span>
        </button>
        <button type="button" className="post-composer-action" disabled title="Coming soon" aria-disabled="true">
          <Video size={18} color="var(--badge-red-fg)" aria-hidden="true" />
          <span className="post-composer-action-label">Video</span>
        </button>
        <button type="button" className="post-composer-action" disabled title="Coming soon" aria-disabled="true">
          <Radio size={18} color="var(--badge-orange-fg)" aria-hidden="true" />
          <span className="post-composer-action-label">Live</span>
        </button>
      </div>
    </div>
  );
}

export default PostComposer;
