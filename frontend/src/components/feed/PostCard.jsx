import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from '../../utils/serverError';
import { AnimatePresence } from 'motion/react';
import { Bookmark, Globe, Lock, MessageCircle, Share2, Users, Pin } from 'lucide-react';
import ReactionButton from './ReactionButton';
import { topReactions } from '../../utils/reactions';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { useLikeToggle } from '../../hooks/useLikeToggle';
import { useBookmarkToggle } from '../../hooks/useBookmarkToggle';
import { useComments } from '../../hooks/useComments';
import { resolveImageUrl } from '../../api';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { firstLink } from '../../utils/links';
import { updatePost, updatePostVisibility } from '../../services/postService';
import { Avatar, VerifiedTick } from '../ui';
import MediaCarousel from './MediaCarousel';
import CommentSection from './CommentSection';
import { MAX_POST_LENGTH } from '../../utils/textLimits';
import PostMenu from './PostMenu';
import PostText from './PostText';
import LinkPreviewCard from '../common/LinkPreviewCard';
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
function PostCard({ post, onRemovePost, onRemovePostsByUser, onUpdatePost, onTogglePin, canModerate = false }) {
  const { t } = useTranslation();
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

  // B5 / Day 20: 'public' | 'followers' | 'only_me', picked in PostMenu.
  const changeVisibility = (next) => {
    const previous = visibility;
    if (next === previous) return;
    setVisibility(next);
    setVisibilityError('');
    updatePostVisibility(post.id, next, token).catch((err) => {
      console.error(err);
      setVisibility(previous);
      setVisibilityError(serverErrorText(err, 'feed.visibilityError'));
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
        await navigator.share({ title: t('feed.shareTitle', { name: post.username }), url });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback(t('feed.linkCopied'));
      setTimeout(() => setShareFeedback(''), 2000);
    } catch (err) {
      console.error(err);
      setShareFeedback(t('feed.copyFailed'));
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
      setEditError(t('feed.editEmpty'));
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
        setEditError(serverErrorText(err, 'feed.updateFailed'));
      })
      .finally(() => setEditPending(false));
  };

  // getFeed's query returns like_count (a cheap correlated COUNT) but no
  // equivalent comment_count -- the real count is only known once the
  // section has actually been opened and useComments' own load() has run.
  // Only shown while open, rather than shown-then-hidden-again after
  // closing, so this can never display a stale number.
  const commentCountLabel = comments.visible
    ? t('feed.commentCount', { count: comments.comments.length })
    : t('feed.comments');

  // The old common/Avatar component did this resolution internally; the
  // new components/ui/Avatar doesn't (it just renders whatever `src` it's
  // given, or falls back to initials), so it's done here instead --
  // otherwise a legacy relative /uploads/... avatar path would render
  // broken. (Sizing a Cloudinary avatar is ui/Avatar's job since Day 27.)
  const avatarSrc = post.avatar_url ? resolveImageUrl(post.avatar_url) : undefined;
  // B14: a page post is shown as the page (the owner stays in post.username
  // for things like Report/Block, which act on the real person).
  const page = post.page || null;
  const initials = ((page ? page.name : post.username) || '?').slice(0, 2).toUpperCase();
  // B2: media[] is the full ordered list; image_url is the fallback for
  // payloads that predate post_media (e.g. a cached older response).
  const media = post.media?.length ? post.media : post.image_url ? [{ url: post.image_url }] : [];
  const hasMedia = media.length > 0;
  const AudienceIcon = visibility === 'only_me' ? Lock : visibility === 'followers' ? Users : Globe;
  const audienceLabel = t(visibility === 'only_me' ? 'feed.audienceOnlyMe' : visibility === 'followers' ? 'feed.audienceFollowers' : 'feed.audiencePublic');

  return (
    <article className="post-card">
      {post.is_pinned && (
        <p className="post-card-pinned">
          <Pin size={13} aria-hidden="true" />
          {t('profile.pinned')}
        </p>
      )}
      <header className="post-card-header">
        <Avatar size={42} src={page ? undefined : avatarSrc} initials={initials} alt="" />
        <div className="post-card-header-text">
          <div className="post-card-author-row">
            {page ? (
              <Link to={`/pages/${page.id}`} className="post-card-author post-card-author-link">{page.name}</Link>
            ) : (
              <span className="post-card-author">{post.username}</span>
            )}
            {post.is_verified && <VerifiedTick size={14} />}
          </div>
          <div className="post-card-meta">
            {page && <span>{t('feed.page')} · </span>}
            <span>{formatRelativeTime(post.created_at)}</span>
            {post.sponsored && <span> · {t('feed.sponsored')}</span>}
            {/* B13/B14: group posts follow the group's privacy and page posts
                are always public -- neither has its own audience. */}
            {!post.community_id && !page && (
              <span className="post-card-audience" title={audienceLabel}>
                {' · '}
                <AudienceIcon size={12} aria-hidden="true" />
                <span className="feed-visually-hidden">{audienceLabel}</span>
              </span>
            )}
          </div>
        </div>
        <PostMenu
          post={post}
          visibility={visibility}
          onChangeVisibility={changeVisibility}
          onBlocked={onRemovePostsByUser}
          onDeleted={onRemovePost}
          onEdit={startEditing}
          canModerate={canModerate}
          onTogglePin={onTogglePin ? () => onTogglePin(post) : undefined}
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
            maxLength={MAX_POST_LENGTH}
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
              {t('common.cancel')}
            </button>
            <button type="button" className="post-card-edit-btn post-card-edit-btn-primary" onClick={saveEdit} disabled={editPending}>
              {editPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <PostText content={post.content} className="post-card-body" />
      )}

      <MediaCarousel
        media={media}
        altPrefix={t('feed.imageAlt', { name: page ? page.name : post.username })}
        className="post-card-media"
      />

      {/* Day 19: a card for the first link -- only when the post has no
          photos of its own (they'd compete for the same space). */}
      {!hasMedia && <LinkPreviewCard url={firstLink(post.content)} />}

      <div className="post-card-stats">
        <span className="post-card-reaction-summary">
          {like.likeCount > 0 && (
            <>
              <span className="post-card-reaction-emojis" aria-hidden="true">
                {shownReactions.map((r) => <span key={r.key}>{r.emoji}</span>)}
              </span>
              <span>
                {t('feed.reactionCount', { count: like.likeCount })}
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
          <span>{t('feed.comment')}</span>
        </button>
        <button type="button" className="post-card-action" onClick={handleShare}>
          <Share2 size={18} aria-hidden="true" />
          <span>{shareFeedback || t('feed.share')}</span>
        </button>
        <button
          type="button"
          className={clsx('post-card-action', bookmark.bookmarked && 'post-card-action-active')}
          onClick={bookmark.toggle}
          disabled={bookmark.pending}
          aria-pressed={bookmark.bookmarked}
        >
          <Bookmark size={18} aria-hidden="true" fill={bookmark.bookmarked ? 'currentColor' : 'none'} />
          <span>{bookmark.bookmarked ? t('feed.saved') : t('feed.save')}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {comments.visible && <CommentSection key="comments" postId={post.id} comments={comments} />}
      </AnimatePresence>
    </article>
  );
}

export default memo(PostCard);
