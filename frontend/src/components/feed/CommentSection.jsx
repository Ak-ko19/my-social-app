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
    editingCommentId,
    editText,
    setEditText,
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
            <li key={c.id} className="feed-comment-item">
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
                  {c.user_id === currentUserId && (
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
        />
        <button type="submit" className="feed-btn feed-btn-secondary">
          Send
        </button>
      </form>
    </section>
  );
}

export default CommentSection;
