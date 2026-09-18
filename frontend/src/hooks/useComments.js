import { useState } from 'react';
import { fetchComments, createComment, updateComment } from '../services/postService';

// Per-post comment state (visibility, list, add, edit) — scoped to a single
// postId so each PostCard owns its own comments independently, instead of
// the parent keeping postId-keyed maps for every open panel/input.
export function useComments(postId, token) {
  const [visible, setVisible] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editText, setEditText] = useState('');

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
    if (!commentInput) return;
    createComment(postId, commentInput, token)
      .then(() => {
        setCommentInput('');
        load();
      })
      .catch((err) => console.error(err));
  };

  const startEdit = (comment) => {
    setEditingCommentId(comment.id);
    setEditText(comment.content);
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditText('');
  };

  const saveEdit = () => {
    if (!editText.trim()) return;
    updateComment(editingCommentId, editText, token)
      .then(() => {
        setEditingCommentId(null);
        setEditText('');
        load();
      })
      .catch((err) => {
        alert(err.response?.data || 'Failed to update comment');
        console.error(err);
      });
  };

  return {
    visible,
    comments,
    commentInput,
    setCommentInput,
    editingCommentId,
    editText,
    setEditText,
    toggleVisible,
    submitComment,
    startEdit,
    cancelEdit,
    saveEdit
  };
}
