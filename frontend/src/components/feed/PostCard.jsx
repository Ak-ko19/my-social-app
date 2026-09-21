import { memo } from 'react';
import { AnimatePresence } from 'motion/react';
import { MoreHorizontal, ThumbsUp, MessageCircle, Share2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { useLikeToggle } from '../../hooks/useLikeToggle';
import { useComments } from '../../hooks/useComments';
import { resolveImageUrl } from '../../api';
import { getOptimizedImageUrl } from '../../utils/cloudinaryImage';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { Avatar, VerifiedTick, IconButton } from '../ui';
import ProgressiveImage from '../common/ProgressiveImage';
import CommentSection from './CommentSection';
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
// rather than being faked. Shares have no backing at all (no column, no
// endpoint, no table anywhere in this app) -- omitted from the stats row
// entirely, and the Share action is genuinely disabled, same treatment as
// Video/Live in PostComposer.jsx.
function PostCard({ post }) {
  const { token, userId, username } = useAuth();
  const like = useLikeToggle(post.id, { likedByMe: post.liked_by_me, likeCount: post.like_count }, token);
  const comments = useComments(post.id, token, { userId, username });

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
            {!post.sponsored && post.visibility && <span> · {post.visibility}</span>}
          </div>
        </div>
        <IconButton icon={MoreHorizontal} aria-label="More options" />
      </header>

      <p className="post-card-body">{post.content}</p>

      {post.image_url && (
        <ProgressiveImage
          src={post.image_url}
          alt={`Image attached to ${post.username}'s post`}
          className="post-card-media"
        />
      )}

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
        <span>{like.likeCount > 0 ? `${like.likeCount} ${like.likeCount === 1 ? 'like' : 'likes'}` : ''}</span>
        <span>{commentCountLabel}</span>
      </div>

      <div className="post-card-actions">
        <button
          type="button"
          className={clsx('post-card-action', like.likedByMe && 'post-card-action-active')}
          onClick={like.toggle}
          disabled={like.pending}
        >
          <ThumbsUp size={18} aria-hidden="true" />
          <span>Like</span>
        </button>
        <button type="button" className="post-card-action" onClick={comments.toggleVisible}>
          <MessageCircle size={18} aria-hidden="true" />
          <span>Comment</span>
        </button>
        <button type="button" className="post-card-action" disabled title="Coming soon" aria-disabled="true">
          <Share2 size={18} aria-hidden="true" />
          <span>Share</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {comments.visible && <CommentSection key="comments" postId={post.id} comments={comments} />}
      </AnimatePresence>
    </article>
  );
}

export default memo(PostCard);
