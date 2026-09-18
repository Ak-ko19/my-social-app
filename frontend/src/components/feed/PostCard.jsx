import { memo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useComments } from '../../hooks/useComments';
import { useLikeToggle } from '../../hooks/useLikeToggle';
import { useFollowToggle } from '../../hooks/useFollowToggle';
import PostHeader from './PostHeader';
import PostContent from './PostContent';
import PostMedia from './PostMedia';
import PostActions from './PostActions';
import CommentSection from './CommentSection';

// Deliberately takes only a plain `post` object (id, content, image_url,
// created_at, user_id, username, avatar_url, like_count, liked_by_me,
// is_following) so it can be reused as-is for Profile/Search/Community/
// Saved feeds later -- it doesn't know or care which feed it's rendered
// inside.
//
// Owns the three interactive mutation hooks (like/follow/comments) and
// passes each one down as a single state+handlers bag, so PostHeader/
// PostActions/LikeButton/FollowButton/CommentSection stay purely
// presentational -- no mutation logic lives in those components themselves.
//
// Memoized: FeedList is virtualized over hundreds of rows, and every
// `loadMore` append creates a new `posts` array, which would otherwise
// re-render every already-mounted PostCard even though their own data
// hasn't changed. `post` keeps a stable reference per item unless that
// post's own data changes, so a shallow prop comparison is enough here.
// Note: the like/follow/comment hooks below seed their state from `post`
// only once, on this component's first mount for a given key -- if the
// feed is later fully reloaded (e.g. the error state's "Try again"), an
// already-mounted card won't re-seed from the fresh server values. This app
// has no real-time sync between sessions anyway, so that's an accepted,
// deliberate simplification rather than a bug to design around here.
function PostCard({ post }) {
  const { token, userId, username } = useAuth();
  const like = useLikeToggle(post.id, { likedByMe: post.liked_by_me, likeCount: post.like_count }, token);
  const follow = useFollowToggle(post.user_id, post.is_following, token);
  const comments = useComments(post.id, token, { userId, username });

  return (
    <article className="feed-post-card">
      <PostHeader post={post} follow={follow} />
      <PostContent content={post.content} />
      <PostMedia src={post.image_url} alt={`Image attached to ${post.username}'s post`} />
      <time className="feed-post-timestamp" dateTime={post.created_at}>
        {new Date(post.created_at).toLocaleString()}
      </time>
      <PostActions
        like={like}
        commentsExpanded={comments.visible}
        onToggleComments={comments.toggleVisible}
      />
      {comments.visible && <CommentSection postId={post.id} comments={comments} />}
    </article>
  );
}

export default memo(PostCard);
