import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from '../../utils/serverError';
import { AnimatePresence } from 'motion/react';
import { Bookmark, Globe, Lock, MessageCircle, Share2, Star, Users, Pin } from 'lucide-react';
import ReactionButton from './ReactionButton';
import { topReactions } from '../../utils/reactions';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { useLikeToggle } from '../../hooks/useLikeToggle';
import { useBookmarkToggle } from '../../hooks/useBookmarkToggle';
import { useComments } from '../../hooks/useComments';
import { useHiddenWords } from '../../hooks/useHiddenWords';
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
import PollView from './PollView';
import LinkPreviewCard from '../common/LinkPreviewCard';
import HiddenContentCover from './HiddenContentCover';
import ShareSheet from './ShareSheet';
import SharedPostCard from './SharedPostCard';
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
// rather than being faked. Days 93-94: Share opens ShareSheet (share to
// your feed now or with your words, copy the link, the device's share
// sheet); a share shows its original in a SharedPostCard, and the stats
// row counts shares.
// canManagePage (Day 53): you run the page this post is on -- edit and
// delete it like its author.
// groupLocked (Day 50): a group post seen by someone not in the group --
// they may read it (and its comments) but not react or comment.
// standalone (Day 49): the post page -- a post your Hidden words would
// leave out of a list is covered there instead (you followed a link to it).
function PostCard({ post, onRemovePost, onRemovePostsByUser, onUpdatePost, onTogglePin, canModerate = false, standalone = false, groupLocked = false, canManagePage = false }) {
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
  const [shareOpen, setShareOpen] = useState(false);
  // A share's count belongs to its original, so only an original's goes up.
  const [shareCount, setShareCount] = useState(post.share_count || 0);
  // B5 audience -- local so an owner's change shows immediately.
  const [visibility, setVisibility] = useState(post.visibility || 'public');
  const [visibilityError, setVisibilityError] = useState('');
  // Day 49: someone else's post with one of your Hidden words in its text
  // or poll options -- covered (warn) or left out (hide). Never your own.
  const hiddenWords = useHiddenWords();
  const [revealed, setRevealed] = useState(false);
  // Days 93-94: a share is checked with the words of the post it shares.
  const filterText = useMemo(() => [post.content, post.shared_post?.content, ...(post.poll?.options || []).map((o) => o.label)].join('\n'), [post.content, post.shared_post, post.poll]);
  const match = useMemo(() => hiddenWords.check(filterText), [hiddenWords, filterText]);
  const filterVerdict = post.user_id === userId || revealed ? null : match;

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

  // A short note on the Share button ("Shared!", "Link copied!").
  const showShareFeedback = (text) => {
    setShareFeedback(text);
    setTimeout(() => setShareFeedback(''), 2000);
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
    // Days 93-94: a share may say nothing of its own.
    if (!trimmed && !post.is_share) {
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

  // Day 85: every list sends comment_count (the comments and replies this
  // viewer would see), so the card says "12 comments" before they are
  // opened, like Facebook's. Once they are open and every page has loaded,
  // the list itself is the count -- it already has the ones just added or
  // deleted here. None: nothing, like the reactions beside it.
  const commentCount = comments.visible && comments.loaded && !comments.nextCursor
    ? comments.comments.length
    : post.comment_count;
  const commentCountLabel = commentCount > 0 ? t('feed.commentCount', { count: commentCount }) : '';

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
  // Day 47: + close friends (a green star).
  const AUDIENCES = {
    only_me: [Lock, 'feed.audienceOnlyMe'],
    followers: [Users, 'feed.audienceFollowers'],
    close_friends: [Star, 'feed.audienceCloseFriends'],
    public: [Globe, 'feed.audiencePublic']
  };
  const [AudienceIcon, audienceKey] = AUDIENCES[visibility] || AUDIENCES.public;
  const audienceLabel = t(audienceKey);

  if (filterVerdict === 'hide' && !standalone) return null;
  const covered = filterVerdict !== null;

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
              <span className={clsx('post-card-audience', visibility === 'close_friends' && 'post-card-audience-close-friends')} title={audienceLabel}>
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
          onMuted={onRemovePostsByUser}
          onDeleted={onRemovePost}
          onEdit={startEditing}
          canModerate={canModerate}
          canManagePage={canManagePage}
          onTogglePin={onTogglePin ? () => onTogglePin(post) : undefined}
          saved={bookmark.bookmarked}
          onSaved={bookmark.markSaved}
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
      ) : covered ? (
        <HiddenContentCover kind="post" onShow={() => setRevealed(true)} />
      ) : (
        <PostText content={post.content} className="post-card-body" />
      )}

      {/* Days 93-94: the post this one shares. */}
      {post.is_share && !covered && <SharedPostCard shared={post.shared_post} />}

      {/* Day 44: a poll post's options or results, under its question. */}
      {post.poll && !covered && <PollView postId={post.id} poll={post.poll} />}

      {!covered && (
        <MediaCarousel
          media={media}
          altPrefix={t('feed.imageAlt', { name: page ? page.name : post.username })}
          className="post-card-media"
        />
      )}

      {/* Day 19: a card for the first link -- only when the post has no
          photos of its own (they'd compete for the same space). */}
      {!hasMedia && !covered && <LinkPreviewCard url={firstLink(post.content)} />}

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
        <span className="post-card-stats-counts">
          {commentCountLabel && <span>{commentCountLabel}</span>}
          {shareCount > 0 && <span>{t('feed.shareCount', { count: shareCount })}</span>}
        </span>
      </div>

      <div className="post-card-actions">
        {!groupLocked && <ReactionButton like={like} />}
        <button type="button" className="post-card-action" onClick={comments.toggleVisible}>
          <MessageCircle size={18} aria-hidden="true" />
          <span>{t('feed.comment')}</span>
        </button>
        <button type="button" className="post-card-action" onClick={() => setShareOpen(true)} aria-haspopup="menu">
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

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        post={post}
        onFeedback={showShareFeedback}
        onShared={() => !post.is_share && setShareCount((n) => n + 1)}
      />

      <AnimatePresence initial={false}>
        {comments.visible && <CommentSection key="comments" postId={post.id} postOwnerId={post.user_id} comments={comments} groupLocked={groupLocked} />}
      </AnimatePresence>
    </article>
  );
}

export default memo(PostCard);
