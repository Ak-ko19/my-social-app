import { useRef, useState } from 'react';
import { fetchComments, fetchReplies, createComment, updateComment, likeComment, unlikeComment, deleteComment, approveComment } from '../services/postService';
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
  // Day 70: comments come a page at a time; nextCursor is null once they
  // are all here. Days 109-110: by thread, Most relevant or Newest.
  const [nextCursor, setNextCursor] = useState(null);
  const [sort, setSort] = useState('relevant');
  // Per thread: the last reply id the server sent (where "View more
  // replies" goes on -- not a reply you just wrote, which is newer than
  // the ones not loaded yet), and which threads are loading more.
  const replyCursorRef = useRef(new Map());
  const [repliesLoading, setRepliesLoading] = useState(() => new Set());
  const [repliesError, setRepliesError] = useState(null);
  // Day 85: the first page has arrived (until then the list says nothing
  // about how many there are).
  const [loaded, setLoaded] = useState(false);
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

  // Remembers how far the server's replies go in each thread.
  const noteReplies = (list) => {
    for (const c of list) {
      if (c.parent_comment_id == null) continue;
      const before = replyCursorRef.current.get(c.parent_comment_id) || 0;
      replyCursorRef.current.set(c.parent_comment_id, Math.max(before, c.id));
    }
  };

  const load = (order = sort) => {
    fetchComments(postId, token, { sort: order })
      .then((page) => {
        replyCursorRef.current = new Map();
        noteReplies(page.comments);
        setComments(page.comments);
        setNextCursor(page.nextCursor);
        setLoaded(true);
      })
      .catch((err) => console.error(err));
  };

  // Days 109-110: Most relevant <-> Newest starts the list again.
  const changeSort = (next) => {
    if (next === sort) return;
    setSort(next);
    setComments([]);
    setNextCursor(null);
    setLoaded(false);
    setLoadMoreError(null);
    load(next);
  };

  // Days 109-110: the next replies of one thread (after the ones the server
  // sent so far); a reply already on screen isn't added twice.
  const loadReplies = (topId) => {
    if (repliesLoading.has(topId)) return;
    setRepliesLoading((current) => new Set(current).add(topId));
    setRepliesError(null);
    fetchReplies(topId, token, { cursor: replyCursorRef.current.get(topId) || 0 })
      .then((page) => {
        noteReplies(page.replies);
        setComments((current) => {
          const have = new Set(current.map((c) => c.id));
          return [...current, ...page.replies.filter((c) => !have.has(c.id))];
        });
      })
      .catch((err) => {
        console.error(err);
        setRepliesError(serverErrorText(err, 'comments.repliesFailed'));
      })
      .finally(() => setRepliesLoading((current) => {
        const next = new Set(current);
        next.delete(topId);
        return next;
      }));
  };

  // The next page, after the ones on screen. A comment already here (your
  // own, just posted, can also come back in a later page) isn't added twice.
  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    fetchComments(postId, token, { cursor: nextCursor, sort })
      .then((page) => {
        noteReplies(page.comments);
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
    // Days 109-110: a new comment goes to the top (Facebook does the same);
    // a reply goes to the end of its thread, which now has one more.
    const bumpReplies = (list, by) => list.map((c) => (target && c.id === target.topId ? { ...c, reply_count: Math.max(0, (c.reply_count || 0) + by) } : c));
    setComments((current) => (target ? [...bumpReplies(current, 1), optimisticComment] : [optimisticComment, ...current]));

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
        setComments((current) => bumpReplies(current.filter((c) => c.id !== tempId), -1));
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
  // A reply leaves its thread one shorter.
  const removeComment = (commentId) => {
    setActionError(null);
    const parentId = comments.find((c) => c.id === commentId)?.parent_comment_id ?? null;
    return deleteComment(commentId, token)
      .then(() => setComments((current) => current
        .filter((c) => c.id !== commentId && c.parent_comment_id !== commentId)
        .map((c) => (parentId !== null && c.id === parentId ? { ...c, reply_count: Math.max(0, (c.reply_count || 0) - 1) } : c))))
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
    loaded,
    nextCursor,
    loadMore,
    loadingMore,
    loadMoreError,
    sort,
    changeSort,
    loadReplies,
    repliesLoading,
    repliesError,
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
