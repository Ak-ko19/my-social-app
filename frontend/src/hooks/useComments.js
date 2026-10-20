import { useRef, useState } from 'react';
import { fetchComments, createComment, updateComment, likeComment, unlikeComment, deleteComment, approveComment } from '../services/postService';
import { serverErrorText } from '../utils/serverError';

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
  // Day 70: comments come a page at a time (oldest first); nextCursor is
  // null once they are all here.
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);

  const [commentInput, setCommentInput] = useState('');
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const submitPendingRef = useRef(false);

  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState(null);

  // B4: the comment being replied to, or null for a top-level comment.
  // { id, username, topId } -- topId is where the reply will actually live
  // (replies are one level deep; see the backend's createComment).
  const [replyingTo, setReplyingTo] = useState(null);
  const [likeError, setLikeError] = useState(null);
  // Day 47: deleting (yours, or any on your post) and approving a
  // restricted person's comment.
  const [actionError, setActionError] = useState(null);
  const likePendingRef = useRef(new Set());

  const load = () => {
    fetchComments(postId, token)
      .then((page) => {
        setComments(page.comments);
        setNextCursor(page.nextCursor);
      })
      .catch((err) => console.error(err));
  };

  // The next page, after the ones on screen. A comment already here (your
  // own, just posted, can also come back in a later page) isn't added twice.
  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    fetchComments(postId, token, { cursor: nextCursor })
      .then((page) => {
        setComments((current) => {
          const have = new Set(current.map((c) => c.id));
          return [...current, ...page.comments.filter((c) => !have.has(c.id))];
        });
        setNextCursor(page.nextCursor);
      })
      .catch((err) => {
        console.error(err);
        setLoadMoreError(serverErrorText(err, 'comments.loadMoreFailed'));
      })
      .finally(() => setLoadingMore(false));
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

    const target = replyingTo;
    setReplyingTo(null);

    const tempId = makeTempId();
    const optimisticComment = {
      id: tempId,
      user_id: currentUser.userId,
      username: currentUser.username || 'You',
      content,
      created_at: new Date().toISOString(),
      parent_comment_id: target ? target.topId : null,
      like_count: 0,
      liked_by_me: false,
      pending: true
    };
    setComments((current) => [...current, optimisticComment]);

    createComment(postId, content, token, target ? target.id : null)
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
        setReplyingTo(target); // ...and the reply target
        setSubmitError(serverErrorText(err, 'errors.postComment'));
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

    updateComment(commentId, nextContent, token)
      .then((updated) => {
        // The server's text, which can differ (Day 43: Zawgyi -> Unicode).
        setComments((current) => current.map((c) => (c.id === commentId ? { ...c, content: updated.content } : c)));
      })
      .catch((err) => {
        console.error(err);
        setComments((current) => current.map((c) => (c.id === commentId ? { ...c, content: previous.content } : c)));
        setEditError(serverErrorText(err, 'errors.updateComment'));
      });
  };

  // Reply to `comment` (top-level or itself a reply). Pre-fills an
  // @mention of whoever is being replied to, like Facebook/Instagram --
  // that also makes it clear who a flattened reply-to-a-reply is for.
  const startReply = (comment) => {
    setReplyingTo({
      id: comment.id,
      username: comment.username,
      topId: comment.parent_comment_id ?? comment.id
    });
    setCommentInput((current) => {
      const mention = `@${comment.username} `;
      return current.startsWith(mention) ? current : mention + current;
    });
  };

  const cancelReply = () => {
    if (replyingTo) {
      const mention = `@${replyingTo.username} `;
      setCommentInput((current) => (current.startsWith(mention) ? current.slice(mention.length) : current));
    }
    setReplyingTo(null);
  };

  // Optimistic like/unlike of one comment, reconciled with the server's
  // count; per-comment in-flight guard against double clicks.
  const toggleCommentLike = (commentId) => {
    if (likePendingRef.current.has(commentId)) return;
    const previous = comments.find((c) => c.id === commentId);
    if (!previous || previous.pending) return;
    likePendingRef.current.add(commentId);
    setLikeError(null);

    const nextLiked = !previous.liked_by_me;
    setComments((current) =>
      current.map((c) =>
        c.id === commentId
          ? { ...c, liked_by_me: nextLiked, like_count: Math.max(0, (c.like_count || 0) + (nextLiked ? 1 : -1)) }
          : c
      )
    );

    (nextLiked ? likeComment : unlikeComment)(commentId, token)
      .then((data) => {
        setComments((current) =>
          current.map((c) => (c.id === commentId ? { ...c, liked_by_me: data.likedByMe, like_count: data.likeCount } : c))
        );
      })
      .catch((err) => {
        console.error(err);
        setComments((current) =>
          current.map((c) =>
            c.id === commentId ? { ...c, liked_by_me: previous.liked_by_me, like_count: previous.like_count } : c
          )
        );
        setLikeError(serverErrorText(err, 'errors.commentLike'));
      })
      .finally(() => likePendingRef.current.delete(commentId));
  };

  // The comment and (a top-level one's) replies go -- the server cascades.
  const removeComment = (commentId) => {
    setActionError(null);
    return deleteComment(commentId, token)
      .then(() => setComments((current) => current.filter((c) => c.id !== commentId && c.parent_comment_id !== commentId)))
      .catch((err) => {
        console.error(err);
        setActionError(serverErrorText(err, 'comments.deleteFailed'));
      });
  };

  const approve = (commentId) => {
    setActionError(null);
    return approveComment(commentId, token)
      .then(() => setComments((current) => current.map((c) => (c.id === commentId ? { ...c, awaiting_approval: false } : c))))
      .catch((err) => {
        console.error(err);
        setActionError(serverErrorText(err, 'comments.approveFailed'));
      });
  };

  return {
    visible,
    nextCursor,
    loadMore,
    loadingMore,
    loadMoreError,
    removeComment,
    approve,
    actionError,
    comments,
    replyingTo,
    startReply,
    cancelReply,
    toggleCommentLike,
    likeError,
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
