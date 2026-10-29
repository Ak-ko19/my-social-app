import { useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { Heart, X } from 'lucide-react';
import clsx from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useHiddenWords } from '../../hooks/useHiddenWords';
import Username from './Username';
import { renderTextWithLinks } from '../../utils/renderTextWithLinks';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import MentionAutocomplete from './MentionAutocomplete';
import HiddenContentCover from './HiddenContentCover';
import ReportDialog from './ReportDialog';
import { ConfirmDialog } from '../ui';
import { MAX_COMMENT_LENGTH } from '../../utils/textLimits';
import { useMentionAutocomplete, applyMentionSelection } from '../../hooks/useMentionAutocomplete';
import { DURATION_NORMAL, EASE_STANDARD } from '../../utils/motionTokens';

// Top-level comments in order, each with its replies (one level, B4).
// A reply whose parent isn't in the list (e.g. hidden by a block) is
// dropped rather than shown out of context.
function buildThreads(list) {
  const topLevel = [];
  const replies = new Map();
  for (const c of list) {
    if (c.parent_comment_id == null) topLevel.push(c);
    else {
      if (!replies.has(c.parent_comment_id)) replies.set(c.parent_comment_id, []);
      replies.get(c.parent_comment_id).push(c);
    }
  }
  return topLevel.map((c) => ({ comment: c, replies: replies.get(c.id) || [] }));
}

// postOwnerId (Day 47): the post's owner may delete any comment on it, and
// approve a restricted person's comment waiting for them.
// locked (Day 50): read only -- not a member of this post's group.
function CommentItem({ c, comments, currentUserId, postOwnerId, onReply, onReport, onDelete, locked = false }) {
  const { t } = useTranslation();
  // Day 49: someone else's comment with one of your Hidden words (warn).
  const hiddenWords = useHiddenWords();
  const [revealed, setRevealed] = useState(false);
  const covered = !revealed && c.user_id !== currentUserId && hiddenWords.check(c.content) === 'warn';
  const { editingCommentId, editText, setEditText, startEdit, cancelEdit, saveEdit, toggleCommentLike } = comments;

  if (editingCommentId === c.id) {
    return (
      <form
        className="feed-comment-edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          saveEdit();
        }}
      >
        <label className="feed-visually-hidden" htmlFor={`edit-comment-${c.id}`}>
          {t('comments.editLabel')}
        </label>
        <input id={`edit-comment-${c.id}`} type="text" maxLength={MAX_COMMENT_LENGTH} value={editText} onChange={(e) => setEditText(e.target.value)} />
        <button type="submit" className="feed-btn">
          {t('common.save')}
        </button>
        <button type="button" onClick={cancelEdit} className="feed-btn">
          {t('common.cancel')}
        </button>
      </form>
    );
  }

  const likeCount = c.like_count || 0;
  return (
    <div className="comment-body">
      <p className="feed-comment-text">
        <Username>{c.username}</Username>:{' '}
        {covered ? <HiddenContentCover kind="comment" onShow={() => setRevealed(true)} /> : <bdi>{renderTextWithLinks(c.content)}</bdi>}
        {c.pending && <span className="feed-comment-status"> {t('comments.pending')}</span>}
      </p>
      {/* Day 47: shown to the post's owner only (the server tells no one else). */}
      {c.awaiting_approval && (
        <p className="comment-held">
          {t('comments.held', { name: c.username })}{' '}
          <button type="button" className="comment-action comment-approve" onClick={() => comments.approve(c.id)}>
            {t('comments.approve')}
          </button>
        </p>
      )}
      {/* A not-yet-confirmed comment has no real id to like/reply/edit
          against, so its actions appear once it's reconciled. */}
      {!c.pending && (
        <div className="comment-actions">
          <span className="comment-time">{formatRelativeTime(c.created_at)}</span>
          {locked ? (
            likeCount > 0 && (
              <span className="comment-action" aria-label={t('comments.likeCountOnly', { count: likeCount })}>
                <Heart size={13} aria-hidden="true" />
                <span aria-hidden="true">{likeCount}</span>
              </span>
            )
          ) : (
            <>
              <button
                type="button"
                className={clsx('comment-action', c.liked_by_me && 'comment-action-liked')}
                onClick={() => toggleCommentLike(c.id)}
                aria-pressed={Boolean(c.liked_by_me)}
                aria-label={t(c.liked_by_me ? 'comments.unlike' : 'comments.like', { name: c.username }) + (likeCount ? t('comments.likeCount', { count: likeCount }) : '')}
              >
                <Heart size={13} aria-hidden="true" fill={c.liked_by_me ? 'currentColor' : 'none'} />
                {likeCount > 0 && <span aria-hidden="true">{likeCount}</span>}
              </button>
              <button type="button" className="comment-action" onClick={() => onReply(c)} aria-label={t('comments.replyTo', { name: c.username })}>
                {t('common.reply')}
              </button>
            </>
          )}
          {c.user_id === currentUserId && (
            <button type="button" className="comment-action" onClick={() => startEdit(c)}>
              {t('common.edit')}
            </button>
          )}
          {/* Day 47: your comment, or any on your own post. */}
          {currentUserId && (c.user_id === currentUserId || postOwnerId === currentUserId) && (
            <button type="button" className="comment-action" onClick={() => onDelete(c)} aria-label={t('comments.deleteAria', { name: c.username })}>
              {t('common.delete')}
            </button>
          )}
          {/* Day 12: someone else's comment can be reported. */}
          {currentUserId && c.user_id !== currentUserId && (
            <button type="button" className="comment-action" onClick={() => onReport(c)} aria-label={t('comments.reportAria', { name: c.username })}>
              {t('comments.report')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Receives the `comments` bag from useComments (owned by PostCard, shared
// with its Comment toggle) rather than fetching its own data.
//
// The open/close transition (PostCard mounts/unmounts this inside an
// AnimatePresence) only animates opacity + a small y offset, never height.
// This card lives inside a virtualized row measured by ResizeObserver --
// animating height would make that observer fire continuously for the
// whole animation, reflowing every row below on every frame.
// groupLocked (Day 50): not in this post's group -- read only.
function CommentSection({ postId, postOwnerId, comments, groupLocked = false }) {
  const { t } = useTranslation();
  const { userId: currentUserId } = useAuth();
  const reduceMotion = useReducedMotion();
  const commentInputRef = useRef(null);
  const mention = useMentionAutocomplete();
  const {
    comments: list,
    commentInput,
    setCommentInput,
    submitPending,
    submitError,
    editError,
    likeError,
    replyingTo,
    startReply,
    cancelReply,
    submitComment
  } = comments;

  // Day 49: "hide" leaves out someone else's comment with one of your
  // Hidden words (and so its replies, which buildThreads drops with it).
  const hiddenWords = useHiddenWords();
  const threads = useMemo(
    () => buildThreads(list.filter((c) => c.user_id === currentUserId || hiddenWords.check(c.content) !== 'hide')),
    [list, currentUserId, hiddenWords]
  );
  // Days 109-110: how many replies of each thread are here (all of them,
  // hidden or not), for "View N more replies".
  const loadedReplies = useMemo(() => {
    const counts = new Map();
    for (const c of list) {
      if (c.parent_comment_id != null) counts.set(c.parent_comment_id, (counts.get(c.parent_comment_id) || 0) + 1);
    }
    return counts;
  }, [list]);
  const [reporting, setReporting] = useState(null); // the comment being reported
  const [deleting, setDeleting] = useState(null); // the comment about to be deleted

  const handleReply = (c) => {
    startReply(c);
    requestAnimationFrame(() => {
      const input = commentInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  };

  return (
    <m.section
      className="feed-comment-section"
      aria-label={t('comments.section')}
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: reduceMotion ? 0 : DURATION_NORMAL, ease: EASE_STANDARD }}
    >
      {/* Days 109-110: Most relevant (the default) or Newest. */}
      {(threads.length > 0 || comments.sort !== 'relevant') && (
        <div role="radiogroup" aria-label={t('comments.sortLabel')} className="comment-sort">
          {['relevant', 'newest'].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={comments.sort === value}
              className={clsx('comment-sort-option', comments.sort === value && 'is-active')}
              onClick={() => comments.changeSort(value)}
            >
              {t(`comments.sort.${value}`)}
            </button>
          ))}
        </div>
      )}
      {threads.length > 0 && (
        <ul className="feed-comment-list">
          {threads.map(({ comment: c, replies }) => (
            <li key={c.id} className={c.pending ? 'feed-comment-pending' : undefined}>
              <CommentItem c={c} comments={comments} currentUserId={currentUserId} onReply={handleReply} onReport={setReporting} postOwnerId={postOwnerId} onDelete={setDeleting} locked={groupLocked} />
              {replies.length > 0 && (
                <ul className="comment-replies" aria-label={t('comments.repliesTo', { name: c.username })}>
                  {replies.map((r) => (
                    <li key={r.id} className={r.pending ? 'feed-comment-pending' : undefined}>
                      <CommentItem c={r} comments={comments} currentUserId={currentUserId} onReply={handleReply} onReport={setReporting} postOwnerId={postOwnerId} onDelete={setDeleting} locked={groupLocked} />
                    </li>
                  ))}
                </ul>
              )}
              {(c.reply_count || 0) > (loadedReplies.get(c.id) || 0) && (
                <button
                  type="button"
                  className="comment-action comment-more-replies"
                  onClick={() => comments.loadReplies(c.id)}
                  disabled={comments.repliesLoading.has(c.id)}
                >
                  {comments.repliesLoading.has(c.id)
                    ? t('common.loading')
                    : t('comments.moreReplies', { count: c.reply_count - (loadedReplies.get(c.id) || 0) })}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {comments.repliesError && <p className="feed-error-text" role="alert">{comments.repliesError}</p>}

      {/* Day 70: the next page follows on (Days 109-110: in the chosen order). */}
      {comments.nextCursor && (
        <button type="button" className="comment-action comment-load-more" onClick={comments.loadMore} disabled={comments.loadingMore}>
          {comments.loadingMore ? t('common.loading') : t('comments.viewMore')}
        </button>
      )}
      {comments.loadMoreError && <p className="feed-error-text" role="alert">{comments.loadMoreError}</p>}

      {(editError || likeError || comments.actionError) && (
        <p className="feed-error-text" role="alert">
          {editError || likeError || comments.actionError}
        </p>
      )}

      {replyingTo && (
        <div className="comment-replying-to" role="status">
          <span>
            <Trans i18nKey="comments.replyingTo" values={{ name: replyingTo.username }} components={{ b: <strong /> }} />
          </span>
          <button type="button" className="comment-replying-cancel" onClick={cancelReply} aria-label={t('comments.cancelReply')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {groupLocked ? (
        <p className="comment-group-locked">{t('groups.joinToComment')}</p>
      ) : (
        <form
          className="feed-comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitComment();
          }}
        >
          <label className="feed-visually-hidden" htmlFor={`comment-input-${postId}`}>
            {replyingTo ? t('comments.replyTo', { name: replyingTo.username }) : t('comments.writeComment')}
          </label>
          <input
            id={`comment-input-${postId}`}
            ref={commentInputRef}
            type="text"
            maxLength={MAX_COMMENT_LENGTH}
            value={commentInput}
            onChange={(e) => {
              setCommentInput(e.target.value);
              mention.handleInputChange(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && replyingTo) cancelReply();
            }}
            placeholder={replyingTo ? t('comments.replyPlaceholder') : t('comments.commentPlaceholder')}
            disabled={submitPending}
          />
          <button type="submit" className="feed-btn" disabled={submitPending}>
            {submitPending ? t('common.sending') : replyingTo ? t('common.reply') : t('common.send')}
          </button>
        </form>
      )}
      {mention.active && (
        <MentionAutocomplete
          suggestions={mention.suggestions}
          onSelect={(user) => {
            const cursorPos = commentInputRef.current?.selectionStart ?? commentInput.length;
            const { value, cursorPos: nextCursorPos } = applyMentionSelection(commentInput, cursorPos, user.username);
            setCommentInput(value);
            mention.reset();
            requestAnimationFrame(() => {
              commentInputRef.current?.focus();
              commentInputRef.current?.setSelectionRange(nextCursorPos, nextCursorPos);
            });
          }}
        />
      )}
      {submitError && (
        <p className="feed-error-text" role="alert">
          {submitError}
        </p>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await comments.removeComment(deleting.id);
          setDeleting(null);
        }}
        title={t('comments.deleteTitle')}
        description={deleting?.parent_comment_id == null ? t('comments.deleteTextReplies') : t('comments.deleteText')}
        confirmLabel={t('common.delete')}
        danger
      />
      {reporting && (
        <ReportDialog
          open
          onClose={() => setReporting(null)}
          targetType="comment"
          targetId={reporting.id}
          label={t('report.thisComment')}
        />
      )}
    </m.section>
  );
}

export default CommentSection;
