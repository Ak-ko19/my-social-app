import { useNavigate } from 'react-router-dom';
import Avatar from '../common/Avatar';
import Username from './Username';
import FollowButton from './FollowButton';
import MoreButton from './MoreButton';
import { useAuth } from '../../hooks/useAuth';

function PostHeader({ post, follow }) {
  const navigate = useNavigate();
  const { userId: currentUserId } = useAuth();
  const isOwner = post.user_id === currentUserId;

  return (
    <header className="feed-post-header">
      <Avatar src={post.avatar_url} size={32} />
      <Username>{post.username}</Username>

      <div className="feed-post-header-actions">
        {/* Hidden on your own posts: you can't follow yourself, and every
            post here is already from someone you follow (this is the
            Home feed), so showing it here would only ever be for unfollowing
            someone else's post. */}
        {!isOwner && <FollowButton follow={follow} />}
        {!isOwner && (
          <button
            type="button"
            onClick={() => navigate(`/messages/${post.user_id}`)}
            className="feed-btn feed-btn-secondary"
          >
            Message
          </button>
        )}
        {isOwner && <MoreButton postId={post.id} />}
      </div>
    </header>
  );
}

export default PostHeader;
