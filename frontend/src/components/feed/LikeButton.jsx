import { useAuth } from '../../hooks/useAuth';
import { useFeedActions } from '../../hooks/useFeedActions';
import { likePost, unlikePost } from '../../services/postService';

// The feed API doesn't return per-post like state, so this preserves the
// existing two-button (Like / Unlike) behavior rather than a true toggle --
// a real toggle needs either a `liked_by_me` field from the backend or the
// optimistic local state that Step 5 will introduce.
function LikeButton({ postId }) {
  const { token } = useAuth();
  const { refreshFeed } = useFeedActions();

  const handleLike = () => {
    likePost(postId, token)
      .then(() => {
        alert('Liked successfully!');
        refreshFeed();
      })
      .catch((err) => {
        alert(err.response?.data || 'Already liked or error occurred');
        console.error(err);
      });
  };

  const handleUnlike = () => {
    unlikePost(postId, token)
      .then(() => {
        alert('Unliked successfully!');
        refreshFeed();
      })
      .catch((err) => {
        alert(err.response?.data || 'You have not liked this post');
        console.error(err);
      });
  };

  return (
    <span className="feed-like-actions">
      <button
        type="button"
        onClick={handleLike}
        aria-label="Like this post"
        className="feed-btn feed-btn-secondary"
      >
        Like
      </button>
      <button
        type="button"
        onClick={handleUnlike}
        aria-label="Unlike this post"
        className="feed-btn feed-btn-secondary"
      >
        Unlike
      </button>
    </span>
  );
}

export default LikeButton;
