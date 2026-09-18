import { useAuth } from '../../hooks/useAuth';
import Username from './Username';

// Receives the `comments` bag from useComments (owned by PostCard, shared
// with the CommentButton toggle) rather than fetching its own data.
function CommentSection({ postId, comments }) {
  const { userId: currentUserId } = useAuth();
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
    <section className="feed-comment-section" aria-label="Comments">
      {list.length > 0 && (
        <ul className="feed-comment-list">
          {list.map((c) => (
            <li key={c.id} className={`feed-comment-item${c.pending ? ' feed-comment-pending' : ''}`}>
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
                  <button type="submit" className="feed-btn feed-btn-secondary">
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit} className="feed-btn feed-btn-secondary">
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
        <button type="submit" className="feed-btn feed-btn-secondary" disabled={submitPending}>
          {submitPending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {submitError && (
        <p className="feed-error-text" role="alert">
          {submitError}
        </p>
      )}
    </section>
  );
}

export default CommentSection;
