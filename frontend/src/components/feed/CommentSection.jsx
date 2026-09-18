import { motion, useReducedMotion } from 'motion/react';
import { useAuth } from '../../hooks/useAuth';
import Username from './Username';
import { DURATION_NORMAL, EASE_STANDARD } from '../../utils/motionTokens';

// Receives the `comments` bag from useComments (owned by PostCard, shared
// with the CommentButton toggle) rather than fetching its own data.
//
// The open/close transition (PostCard mounts/unmounts this inside an
// AnimatePresence) only animates opacity + a small y offset, never height.
// This card lives inside a virtualized row measured by ResizeObserver
// (Step 3) -- animating height would make that observer fire continuously
// for the whole animation, reflowing every row below on every frame. With
// opacity/transform only, the row's real height changes once, instantly,
// and the observer only has to react a single time.
function CommentSection({ postId, comments }) {
  const { userId: currentUserId } = useAuth();
  const reduceMotion = useReducedMotion();
  const {
    comments: list,
    commentInput,
    setCommentInput,
    submitPending,
    submitError,
    editingCommentId,
    editText,
    setEditText,
    editError,
    submitComment,
    startEdit,
    cancelEdit,
    saveEdit
  } = comments;

  return (
    <motion.section
      className="feed-comment-section"
      aria-label="Comments"
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: reduceMotion ? 0 : DURATION_NORMAL, ease: EASE_STANDARD }}
    >
      {list.length > 0 && (
        <ul className="feed-comment-list">
          {list.map((c) => (
            <li key={c.id} className={c.pending ? 'feed-comment-pending' : undefined}>
              {editingCommentId === c.id ? (
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
                  <input
                    id={`edit-comment-${c.id}`}
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <button type="submit" className="feed-btn">
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit} className="feed-btn">
                    Cancel
                  </button>
                </form>
              ) : (
                <p className="feed-comment-text">
                  <Username>{c.username}</Username>: {c.content}
                  {c.pending && <span className="feed-comment-status"> (sending…)</span>}
                  {/* Editing a not-yet-confirmed comment has no real id to PUT
                      against, so the edit action is hidden until it's reconciled. */}
                  {!c.pending && c.user_id === currentUserId && (
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="feed-btn feed-btn-link"
                    >
                      Edit
                    </button>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {editError && (
        <p className="feed-error-text" role="alert">
          {editError}
        </p>
      )}

      <form
        className="feed-comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          submitComment();
        }}
      >
        <label className="feed-visually-hidden" htmlFor={`comment-input-${postId}`}>
          Write a comment
        </label>
        <input
          id={`comment-input-${postId}`}
          type="text"
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          placeholder="Write a comment..."
          disabled={submitPending}
        />
        <button type="submit" className="feed-btn" disabled={submitPending}>
          {submitPending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {submitError && (
        <p className="feed-error-text" role="alert">
          {submitError}
        </p>
      )}
    </motion.section>
  );
}

export default CommentSection;
