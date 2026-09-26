import { memo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Bookmark, Globe, MessageCircle, Share2, Users } from 'lucide-react';
import ReactionButton from './ReactionButton';
import { topReactions } from '../../utils/reactions';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { useLikeToggle } from '../../hooks/useLikeToggle';
import { useBookmarkToggle } from '../../hooks/useBookmarkToggle';
import { useComments } from '../../hooks/useComments';
import { resolveImageUrl } from '../../api';
import { getOptimizedImageUrl } from '../../utils/cloudinaryImage';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { updatePost, updatePostVisibility } from '../../services/postService';
import { Avatar, VerifiedTick } from '../ui';
import MediaCarousel from './MediaCarousel';
import CommentSection from './CommentSection';
import PostMenu from './PostMenu';
import PostText from './PostText';
import './PostCard.css';

// Replaces the old Feed.css-based PostCard IN PLACE -- same external
// contract as before (`post` prop, self-contained like/comment hooks), so
// FeedList.jsx/Feed.jsx need no changes at all: only what's rendered here
// changed. Follow isn't rendered here (the new header spec doesn't include
// it), so useFollowToggle isn't called -- nothing else in this file needs
// it either.
//
// Fields with no real backing data today -- verified tick, a visibility/
// "Sponsored" label, and the link-preview block -- are genuinely optional,
// driven by fields on `post` that don't exist in the current API response
// shape (checked directly against the posts table: id, user_id, content,
// created_at, image_url -- nothing else, and no `verified` column on
// users either). They simply don't render until/unless that data exists,
// rather than being faked. Share has no server-side count to display (no
// shares table, and none is needed -- sharing a link isn't a trackable
// server event the way a like/bookmark is), so it's omitted from the stats
// row but the action itself is real: Web Share API where available,
// clipboard-copy fallback otherwise (see handleShare below).
function PostCard({ post, onRemovePost, onRemovePostsByUser, onUpdatePost }) {
  const { token, userId, username } = useAuth();
  const like = useLikeToggle(
    post.id,
    {
      likedByMe: post.liked_by_me,
      likeCount: post.like_count,
      myReaction: post.my_reaction,
      reactionCounts: post.reaction_counts
    },
    token
  );
  const shownReactions = topReactions(like.reactionCounts);
  const bookmark = useBookmarkToggle(post.id, post.bookmarked_by_me, token);
  const comments = useComments(post.id, token, { userId, username });

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState('');
  const [shareFeedback, setShareFeedback] = useState('');
  // B5 audience -- local so an owner's change shows immediately.
  const [visibility, setVisibility] = useState(post.visibility || 'public');
  const [visibilityError, setVisibilityError] = useState('');

  const toggleVisibility = () => {
    const previous = visibility;
    const next = previous === 'followers' ? 'public' : 'followers';
    setVisibility(next);
    setVisibilityError('');
    updatePostVisibility(post.id, next, token).catch((err) => {
      console.error(err);
      setVisibility(previous);
      setVisibilityError(err.response?.data || 'Could not change who can see this post');
    });
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/posts/${post.id}`;
    // navigator.share is the native OS share sheet (Android/iOS/desktop
    // browsers that support it) -- preferred when available since it lets
    // the user pick an actual destination (Messages, another app, ...)
    // instead of just landing a URL on their clipboard. A cancelled share
    // sheet throws an AbortError, which is a normal user action, not a
    // failure -- silently ignored rather than falling through to the
    // clipboard fallback (that would paper over an intentional cancel with
    // an unrequested clipboard write).
    if (navigator.share) {
      try {
        await navigator.share({ title: `${post.username} on MySocialApp`, url });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback('Link copied!');
      setTimeout(() => setShareFeedback(''), 2000);
    } catch (err) {
      console.error(err);
      setShareFeedback('Failed to copy link');
      setTimeout(() => setShareFeedback(''), 2000);
    }
  };

  const startEditing = () => {
    setEditContent(post.content);
    setEditError('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditError('');
  };

  const saveEdit = () => {
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditError('Post content cannot be empty');
      return;
    }
    setEditPending(true);
    setEditError('');
    updatePost(post.id, trimmed, token)
      .then((updated) => {
        onUpdatePost?.(post.id, { content: updated.content });
        setIsEditing(false);
      })
      .catch((err) => {
        console.error(err);
        setEditError(err.response?.data || 'Failed to update post');
      })
      .finally(() => setEditPending(false));
  };

  // getFeed's query returns like_count (a cheap correlated COUNT) but no
  // equivalent comment_count -- the real count is only known once the
  // section has actually been opened and useComments' own load() has run.
  // Only shown while open, rather than shown-then-hidden-again after
  // closing, so this can never display a stale number.
  const commentCountLabel = comments.visible
    ? `${comments.comments.length} comment${comments.comments.length === 1 ? '' : 's'}`
    : 'Comments';

  // The old common/Avatar component did this resolution internally; the
  // new components/ui/Avatar doesn't (it just renders whatever `src` it's
  // given, or falls back to initials), so it's done here instead --
  // otherwise a legacy relative /uploads/... avatar path would render
  // broken, and a real Cloudinary one would request a full-size image
  // instead of one sized for a 42px avatar.
  const avatarSrc = post.avatar_url ? getOptimizedImageUrl(resolveImageUrl(post.avatar_url), 84) : undefined;
  const initials = (post.username || '?').slice(0, 2).toUpperCase();

  return (
    <article className="post-card">
      <header className="post-card-header">
        <Avatar size={42} src={avatarSrc} initials={initials} alt="" />
        <div className="post-card-header-text">
          <div className="post-card-author-row">
            <span className="post-card-author">{post.username}</span>
            {post.is_verified && <VerifiedTick size={14} />}
          </div>
          <div className="post-card-meta">
            <span>{formatRelativeTime(post.created_at)}</span>
            {post.sponsored && <span> · Sponsored</span>}
            <span className="post-card-audience" title={visibility === 'followers' ? 'Followers only' : 'Public'}>
              {' · '}
              {visibility === 'followers' ? <Users size={12} aria-hidden="true" /> : <Globe size={12} aria-hidden="true" />}
              <span className="feed-visually-hidden">{visibility === 'followers' ? 'Followers only' : 'Public'}</span>
            </span>
          </div>
        </div>
        <PostMenu
          post={post}
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          onBlocked={onRemovePostsByUser}
          onDeleted={onRemovePost}
          onEdit={startEditing}
        />
      </header>
      {visibilityError && (
        <p className="feed-error-text" role="alert">
          {visibilityError}
        </p>
      )}

      {isEditing ? (
        <div className="post-card-edit">
          <textarea
            className="post-card-edit-textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
            autoFocus
          />
          {editError && (
            <p className="post-card-edit-error" role="alert">
              {editError}
            </p>
          )}
          <div className="post-card-edit-actions">
            <button type="button" className="post-card-edit-btn post-card-edit-btn-secondary" onClick={cancelEditing} disabled={editPending}>
              Cancel
            </button>
            <button type="button" className="post-card-edit-btn post-card-edit-btn-primary" onClick={saveEdit} disabled={editPending}>
              {editPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <PostText content={post.content} className="post-card-body" />
      )}

      {/* B2: media[] is the full ordered list; image_url is the fallback for
          payloads that predate post_media (e.g. a cached older response). */}
      <MediaCarousel
        media={post.media?.length ? post.media : post.image_url ? [{ url: post.image_url }] : []}
        altPrefix={`Image attached to ${post.username}'s post`}
        className="post-card-media"
      />

      {post.linkPreview && (
        <a className="post-card-link-preview" href={post.linkPreview.url} target="_blank" rel="noreferrer">
          {post.linkPreview.image && (
            <div className="post-card-link-preview-media">
              <img src={post.linkPreview.image} alt="" />
              {post.linkPreview.cta && <span className="post-card-link-preview-cta">{post.linkPreview.cta}</span>}
            </div>
          )}
          <div className="post-card-link-preview-text">
            {post.linkPreview.domain && (
              <span className="post-card-link-preview-domain">{post.linkPreview.domain}</span>
            )}
            <span className="post-card-link-preview-title">{post.linkPreview.title}</span>
            {post.linkPreview.subtitle && (
              <span className="post-card-link-preview-subtitle">{post.linkPreview.subtitle}</span>
            )}
          </div>
        </a>
      )}

      <div className="post-card-stats">
        <span className="post-card-reaction-summary">
          {like.likeCount > 0 && (
            <>
              <span className="post-card-reaction-emojis" aria-hidden="true">
                {shownReactions.map((r) => <span key={r.key}>{r.emoji}</span>)}
              </span>
              <span>
                {like.likeCount} {like.likeCount === 1 ? 'reaction' : 'reactions'}
              </span>
            </>
          )}
        </span>
        <span>{commentCountLabel}</span>
      </div>

      <div className="post-card-actions">
        <ReactionButton like={like} />
        <button type="button" className="post-card-action" onClick={comments.toggleVisible}>
          <MessageCircle size={18} aria-hidden="true" />
          <span>Comment</span>
        </button>
        <button type="button" className="post-card-action" onClick={handleShare}>
          <Share2 size={18} aria-hidden="true" />
          <span>{shareFeedback || 'Share'}</span>
        </button>
        <button
          type="button"
          className={clsx('post-card-action', bookmark.bookmarked && 'post-card-action-active')}
          onClick={bookmark.toggle}
          disabled={bookmark.pending}
          aria-pressed={bookmark.bookmarked}
        >
          <Bookmark size={18} aria-hidden="true" fill={bookmark.bookmarked ? 'currentColor' : 'none'} />
          <span>{bookmark.bookmarked ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {comments.visible && <CommentSection key="comments" postId={post.id} comments={comments} />}
      </AnimatePresence>
    </article>
  );
}

export default memo(PostCard);
