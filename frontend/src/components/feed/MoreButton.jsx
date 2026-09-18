import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useFeedActions } from '../../hooks/useFeedActions';
import { deletePost } from '../../services/postService';

// Only rendered for the post's own author (see PostHeader). Wired to the
// existing, already-tested DELETE /posts/:id endpoint -- this is new
// frontend functionality (no delete UI existed before), added so the menu
// isn't a dead placeholder. No edit UI is included; that would need a full
// edit form and is out of scope for this step.
function MoreButton({ postId }) {
  const { token } = useAuth();
  const { removePost } = useFeedActions();
  const [error, setError] = useState('');

  const handleDelete = () => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    deletePost(postId, token)
      .then(() => removePost(postId))
      .catch((err) => {
        console.error(err);
        setError(err.response?.data || 'Failed to delete post');
      });
  };

  return (
    <details className="feed-more-menu">
      <summary aria-label="More options" className="feed-more-summary">
        &#8942;
      </summary>
      <div role="menu" className="feed-more-panel">
        <button
          type="button"
          role="menuitem"
          onClick={handleDelete}
          className="feed-more-item feed-more-item-danger"
        >
          Delete post
        </button>
        {error && (
          <p className="feed-error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

export default MoreButton;
