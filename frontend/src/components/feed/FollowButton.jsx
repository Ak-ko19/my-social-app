import { useAuth } from '../../hooks/useAuth';
import { followUser, unfollowUser } from '../../services/postService';

// Preserves the existing behavior exactly: both Follow and Unfollow are
// always shown (the feed API doesn't tell us the current follow state), and
// neither refreshes the feed on success — same as before componentization.
function FollowButton({ userId }) {
  const { token } = useAuth();

  const handleFollow = () => {
    followUser(userId, token)
      .then(() => alert('Followed!'))
      .catch((err) => console.error(err));
  };

  const handleUnfollow = () => {
    unfollowUser(userId, token)
      .then(() => alert('Unfollowed!'))
      .catch((err) => console.error(err));
  };

  return (
    <span className="feed-follow-actions">
      <button type="button" onClick={handleFollow} className="feed-btn feed-btn-secondary">
        Follow
      </button>
      <button type="button" onClick={handleUnfollow} className="feed-btn feed-btn-secondary">
        Unfollow
      </button>
    </span>
  );
}

export default FollowButton;
