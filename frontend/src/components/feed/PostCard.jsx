import { useAuth } from '../../hooks/useAuth';
import { useComments } from '../../hooks/useComments';
import PostHeader from './PostHeader';
import PostContent from './PostContent';
import PostMedia from './PostMedia';
import PostActions from './PostActions';
import CommentSection from './CommentSection';

// Deliberately takes only a plain `post` object (id, content, image_url,
// created_at, user_id, username, avatar_url) so it can be reused as-is for
// Profile/Search/Community/Saved feeds later -- it doesn't know or care
// which feed it's rendered inside.
function PostCard({ post }) {
  const { token } = useAuth();
  const comments = useComments(post.id, token);

  return (
    <article className="feed-post-card">
      <PostHeader post={post} />
      <PostContent content={post.content} />
      <PostMedia src={post.image_url} />
      <time className="feed-post-timestamp" dateTime={post.created_at}>
        {new Date(post.created_at).toLocaleString()}
      </time>
      <PostActions
        postId={post.id}
        commentsExpanded={comments.visible}
        onToggleComments={comments.toggleVisible}
      />
      {comments.visible && <CommentSection postId={post.id} comments={comments} />}
    </article>
  );
}

export default PostCard;
