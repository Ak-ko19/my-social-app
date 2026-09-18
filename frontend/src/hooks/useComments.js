import { useRef, useState } from 'react';
import { fetchComments, createComment, updateComment } from '../services/postService';

let tempIdSeq = 0;
function makeTempId() {
  tempIdSeq += 1;
  return `temp-${Date.now()}-${tempIdSeq}`;
}

// Per-post comment state (visibility, list, add, edit) — scoped to a single
// postId so each PostCard owns its own comments independently. Comment
// creation and editing are both optimistic: the change is applied to
// `comments` immediately, then reconciled or rolled back once the request
// settles. `currentUser` ({ userId, username }) is needed so an optimistic
// comment can display a real author name immediately, since the create
// response itself doesn't include one (comments only store user_id).
export function useComments(postId, token, currentUser) {
  const [visible, setVisible] = useState(false);
  const [comments, setComments] = useState([]);

  const [commentInput, setCommentInput] = useState('');
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const submitPendingRef = useRef(false);

  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState(null);

  const load = () => {
    fetchComments(postId)
      .then(setComments)
      .catch((err) => console.error(err));
  };

  const toggleVisible = () => {
    setVisible((current) => {
      const next = !current;
      if (next) load();
      return next;
    });
  };

  const submitComment = () => {
    const content = commentInput;
    // Guards against both an empty submit and a duplicate/rapid double-send
    // of the same comment while the first request is still in flight.
    if (!content || submitPendingRef.current) return;

    submitPendingRef.current = true;
    setSubmitPending(true);
    setSubmitError(null);
    setCommentInput('');

    const tempId = makeTempId();
    const optimisticComment = {
      id: tempId,
      user_id: currentUser.userId,
      username: currentUser.username || 'You',
      content,
      created_at: new Date().toISOString(),
      pending: true
    };
    setComments((current) => [...current, optimisticComment]);

    createComment(postId, content, token)
      .then((created) => {
        // Reconcile the temp comment with the server-generated one, by
        // temp id -> matching this exact optimistic entry, not by appending
        // a second copy alongside it.
        setComments((current) =>
          current.map((c) =>
            c.id === tempId ? { ...created, username: currentUser.username || 'You' } : c
          )
        );
      })
      .catch((err) => {
        console.error(err);
        setComments((current) => current.filter((c) => c.id !== tempId));
        setCommentInput(content); // give the text back so nothing is lost
        setSubmitError(err.response?.data || 'Failed to post comment');
      })
      .finally(() => {
        submitPendingRef.current = false;
        setSubmitPending(false);
      });
  };

  const startEdit = (comment) => {
    setEditError(null);
    setEditingCommentId(comment.id);
    setEditText(comment.content);
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditText('');
    setEditError(null);
  };

  const saveEdit = () => {
    if (!editText.trim()) return;
    const commentId = editingCommentId;
    const nextContent = editText;
    const previous = comments.find((c) => c.id === commentId);
    if (!previous) return;

    setComments((current) => current.map((c) => (c.id === commentId ? { ...c, content: nextContent } : c)));
    setEditingCommentId(null);
    setEditText('');

    updateComment(commentId, nextContent, token).catch((err) => {
      console.error(err);
      setComments((current) => current.map((c) => (c.id === commentId ? { ...c, content: previous.content } : c)));
      setEditError(err.response?.data || 'Failed to update comment');
    });
  };

  return {
    visible,
    comments,
    commentInput,
    setCommentInput,
    submitPending,
    submitError,
    editingCommentId,
    editText,
    setEditText,
    editError,
    toggleVisible,
    submitComment,
    startEdit,
    cancelEdit,
    saveEdit
  };
}
