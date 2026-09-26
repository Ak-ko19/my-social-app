import { useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Heart, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import Username from './Username';
import { renderTextWithLinks } from '../../utils/renderTextWithLinks';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import MentionAutocomplete from './MentionAutocomplete';
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

function CommentItem({ c, comments, currentUserId, onReply }) {
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
          Edit comment
        </label>
        <input id={`edit-comment-${c.id}`} type="text" value={editText} onChange={(e) => setEditText(e.target.value)} />
        <button type="submit" className="feed-btn">
          Save
        </button>
        <button type="button" onClick={cancelEdit} className="feed-btn">
          Cancel
        </button>
      </form>
    );
  }

  const likeCount = c.like_count || 0;
  return (
    <div className="comment-body">
      <p className="feed-comment-text">
        <Username>{c.username}</Username>: {renderTextWithLinks(c.content)}
        {c.pending && <span className="feed-comment-status"> (sending…)</span>}
      </p>
      {/* A not-yet-confirmed comment has no real id to like/reply/edit
          against, so its actions appear once it's reconciled. */}
      {!c.pending && (
        <div className="comment-actions">
          <span className="comment-time">{formatRelativeTime(c.created_at)}</span>
          <button
            type="button"
            className={clsx('comment-action', c.liked_by_me && 'comment-action-liked')}
            onClick={() => toggleCommentLike(c.id)}
            aria-pressed={Boolean(c.liked_by_me)}
            aria-label={`${c.liked_by_me ? 'Unlike' : 'Like'} ${c.username}'s comment${likeCount ? `, ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}` : ''}`}
          >
            <Heart size={13} aria-hidden="true" fill={c.liked_by_me ? 'currentColor' : 'none'} />
            {likeCount > 0 && <span aria-hidden="true">{likeCount}</span>}
          </button>
          <button type="button" className="comment-action" onClick={() => onReply(c)} aria-label={`Reply to ${c.username}`}>
            Reply
          </button>
          {c.user_id === currentUserId && (
            <button type="button" className="comment-action" onClick={() => startEdit(c)}>
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Receives the `comments` bag from useComments (owned by PostCard, shared
// with the CommentButton toggle) rather than fetching its own data.
//
// The open/close transition (PostCard mounts/unmounts this inside an
// AnimatePresence) only animates opacity + a small y offset, never height.
// This card lives inside a virtualized row measured by ResizeObserver --
// animating height would make that observer fire continuously for the
// whole animation, reflowing every row below on every frame.
function CommentSection({ postId, comments }) {
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

  const threads = buildThreads(list);

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
    <motion.section
      className="feed-comment-section"
      aria-label="Comments"
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: reduceMotion ? 0 : DURATION_NORMAL, ease: EASE_STANDARD }}
    >
      {threads.length > 0 && (
        <ul className="feed-comment-list">
          {threads.map(({ comment: c, replies }) => (
            <li key={c.id} className={c.pending ? 'feed-comment-pending' : undefined}>
              <CommentItem c={c} comments={comments} currentUserId={currentUserId} onReply={handleReply} />
              {replies.length > 0 && (
                <ul className="comment-replies" aria-label={`Replies to ${c.username}`}>
                  {replies.map((r) => (
                    <li key={r.id} className={r.pending ? 'feed-comment-pending' : undefined}>
                      <CommentItem c={r} comments={comments} currentUserId={currentUserId} onReply={handleReply} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {(editError || likeError) && (
        <p className="feed-error-text" role="alert">
          {editError || likeError}
        </p>
      )}

      {replyingTo && (
        <div className="comment-replying-to" role="status">
          <span>
            Replying to <strong>@{replyingTo.username}</strong>
          </span>
          <button type="button" className="comment-replying-cancel" onClick={cancelReply} aria-label="Cancel reply">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <form
        className="feed-comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          submitComment();
        }}
      >
        <label className="feed-visually-hidden" htmlFor={`comment-input-${postId}`}>
          {replyingTo ? `Reply to ${replyingTo.username}` : 'Write a comment'}
        </label>
        <input
          id={`comment-input-${postId}`}
          ref={commentInputRef}
          type="text"
          value={commentInput}
          onChange={(e) => {
            setCommentInput(e.target.value);
            mention.handleInputChange(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && replyingTo) cancelReply();
          }}
          placeholder={replyingTo ? 'Write a reply...' : 'Write a comment... (@ to mention someone)'}
          disabled={submitPending}
        />
        <button type="submit" className="feed-btn" disabled={submitPending}>
          {submitPending ? 'Sending…' : replyingTo ? 'Reply' : 'Send'}
        </button>
      </form>
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
    </motion.section>
  );
}

export default CommentSection;
