import LikeButton from './LikeButton';
import CommentButton from './CommentButton';

// ShareButton / BookmarkButton are intentionally omitted: there is no
// backend support (no share/bookmark routes or tables) yet, and adding
// buttons with no real action would just be dead UI. This layout leaves
// room to slot them in later without another refactor.
function PostActions({ like, commentsExpanded, onToggleComments }) {
  return (
    <div className="feed-post-actions">
      <LikeButton like={like} />
      <CommentButton expanded={commentsExpanded} onToggle={onToggleComments} />
    </div>
  );
}

export default PostActions;
