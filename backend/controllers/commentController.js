const db = require('../db');
const { getLimit } = require('../utils/cursorPagination');
const { HttpError, sendError } = require('../utils/httpError');
const mentionService = require('../services/mentionService');
const { getVisiblePost } = require('../services/postVisibilityService');
const blockService = require('../services/blockService');
const { noBlockBetweenSql } = require('../services/blockService');
const notificationService = require('../services/notificationService');
const { toUnicode } = require('../utils/myanmarText');
const { isRestricted } = require('../services/restrictService');
const interactionService = require('../services/interactionService');
const spamService = require('../services/spamService');
const communityService = require('../services/communityService');
const { popularityScoreSql } = require('../services/popularity');
const { managesPage } = require('../services/pageAdminService');

// Day 43: comments had no length limit; same as a chat message.
const MAX_COMMENT_LENGTH = 5000;

// Day 43: Zawgyi Myanmar text is stored as Unicode (utils/myanmarText).
// Returns the text to store, or an error message for a 400.
// The limit counts the text as typed (like the comment box's maxLength).
function readContent(body) {
  const typed = body.content;
  if (typeof typed !== 'string' || typed.trim() === '') return { error: 'Comment cannot be empty' };
  if (typed.length > MAX_COMMENT_LENGTH) return { error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer` };
  return { content: toUnicode(typed) };
}

async function createComment(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const { content, error } = readContent(req.body);
    if (error) {
      return res.status(400).send(error);
    }
    // Same visibility rules as GET /posts/:id -- see postVisibilityService.
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
      return res.status(404).send('Post not found');
    }
    // Day 50: only members comment and react in a group.
    communityService.assertCanInteract(post);
    // Day 47: the owner's "who can comment" setting (a group's or page's
    // post belongs to the group / page).
    if (!post.community_id && !post.page_id) {
      await interactionService.assertCanComment(req.userId, post.user_id);
    }
    // Day 49: flooding, the same comment again here, the same link again
    // and again.
    await spamService.checkComment(req.userId, post.id, content);
    // B4 replies: optional parentCommentId. Replies are one level deep --
    // replying to a reply attaches to that reply's own parent (see
    // migration 019). The parent must be on this post and visible to the
    // replier (no block with its author).
    let parentId = null;
    let parentAuthorId = null;
    if (req.body.parentCommentId !== undefined && req.body.parentCommentId !== null) {
      const parentCommentId = Number(req.body.parentCommentId);
      if (!Number.isInteger(parentCommentId)) {
        return res.status(400).send('Invalid parent comment');
      }
      const parentResult = await db.query(
        'SELECT id, post_id, user_id, parent_comment_id FROM comments WHERE id = $1',
        [parentCommentId]
      );
      const parent = parentResult.rows[0];
      if (!parent || parent.post_id !== post.id || (await blockService.isBlocked(req.userId, parent.user_id))) {
        return res.status(400).send('Invalid parent comment');
      }
      if (parent.parent_comment_id) {
        const topResult = await db.query('SELECT id, user_id FROM comments WHERE id = $1', [parent.parent_comment_id]);
        parentId = topResult.rows[0].id;
      } else {
        parentId = parent.id;
      }
      // Notify the person actually replied to (the reply's author, when
      // replying to a reply).
      parentAuthorId = parent.user_id;
    }

    // Day 47: on a post by someone who restricted you, the comment waits
    // for their approval -- seen only by you and them, and it notifies
    // nobody (not the owner, not the person replied to, not @mentions).
    const postOwnerId = post.user_id;
    const awaiting = postOwnerId !== req.userId && (await isRestricted(postOwnerId, req.userId));
    const result = await db.query(
      'INSERT INTO comments (post_id, user_id, content, parent_comment_id, awaiting_approval) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.id, req.userId, content, parentId, awaiting]
    );
    const newCommentId = result.rows[0].id;
    // The commenter is never told: their copy looks like any comment.
    const { awaiting_approval: _held, ...comment } = result.rows[0];
    if (awaiting) {
      return res.status(201).json({ ...comment, like_count: 0, liked_by_me: false });
    }
    const notifyReply = parentAuthorId !== null && parentAuthorId !== req.userId;
    // One notification per person: when the post owner is also the one
    // being replied to, they get the more specific 'reply' only.
    if (postOwnerId !== req.userId && !(notifyReply && parentAuthorId === postOwnerId)) {
      await notificationService.notify({ userId: postOwnerId, actorId: req.userId, type: 'comment', postId: post.id, commentId: newCommentId });
    }
    if (notifyReply) {
      await notificationService.notify({ userId: parentAuthorId, actorId: req.userId, type: 'reply', postId: post.id, commentId: newCommentId });
    }
    await mentionService.notifyMentions({
      content,
      authorId: req.userId,
      postId: parseInt(req.params.id, 10),
      commentId: result.rows[0].id,
      excludeUserIds: notifyReply ? [parentAuthorId] : []
    });
    res.status(201).json({ ...comment, like_count: 0, liked_by_me: false });
  } catch (err) {
    sendError(res, err, 'Create comment failed. Please try again later.');
  }
}

// Days 109-110: comments come by thread, like Facebook's. A page is a
// number of top-level comments in the chosen order, each followed by its
// first REPLY_PREVIEW replies; more replies come from GET
// /comments/:id/replies. (Day 70's single list, oldest first, threaded on
// the client because a reply is always newer than its parent -- which only
// holds in that one order.)
const SORTS = ['relevant', 'newest'];
const REPLY_PREVIEW = 2;

// "Viewer $v may see comment c on a post owned by $o": not waiting for
// approval (Day 47) unless it's the viewer's or the viewer owns the post,
// and no block either way.
const commentVisibleSql = (c, v, o) => `
  (NOT ${c}.awaiting_approval OR ${c}.user_id = ${v} OR ${v}::int = ${o}::int)
  AND (${v}::int IS NULL OR ${noBlockBetweenSql(v, `${c}.user_id`)})`;

// One comment as the list shows it ($v the viewer, $o the post's owner).
const commentColumnsSql = (c, v, o) => `
  ${c}.id, ${c}.content, ${c}.created_at, ${c}.parent_comment_id,
  u.id AS user_id, u.username,
  (SELECT COUNT(*)::int FROM comment_likes cl WHERE cl.comment_id = ${c}.id) AS like_count,
  ${v}::int IS NOT NULL AND EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = ${c}.id AND cl.user_id = ${v}) AS liked_by_me,
  -- Day 47: only the post's owner learns a comment is waiting.
  (${c}.awaiting_approval AND ${v}::int = ${o}::int) AS awaiting_approval`;

// The replies to top-level comment t that the viewer may see.
const visibleReplyCountSql = (t, v, o) => `(
  SELECT COUNT(*)::int FROM comments r WHERE r.parent_comment_id = ${t}.id AND ${commentVisibleSql('r', v, o)})`;

// $1 post, $2 viewer, $3 the post's owner, $4 cursor, $5 limit + 1, $6 the
// pinned comment (step 2: it is never part of the order -- page 1 starts
// with it).
// Newest: by id, after the cursor's id. Most relevant: the Explore score
// (reactions, replies, age -- services/popularity.js); the cursor is how
// many threads were sent before (ranks move as people react; the app
// skips a comment it already has).
const TOP_LEVEL_SQL = {
  newest: `
    SELECT ${commentColumnsSql('c', '$2', '$3')}, ${visibleReplyCountSql('c', '$2', '$3')} AS reply_count
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = $1 AND c.parent_comment_id IS NULL AND ${commentVisibleSql('c', '$2', '$3')}
      AND c.id IS DISTINCT FROM $6::int
      AND ($4 = 0 OR c.id < $4)
    ORDER BY c.id DESC
    LIMIT $5`,
  relevant: `
    SELECT ${commentColumnsSql('c', '$2', '$3')}, ${visibleReplyCountSql('c', '$2', '$3')} AS reply_count
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = $1 AND c.parent_comment_id IS NULL AND ${commentVisibleSql('c', '$2', '$3')}
      AND c.id IS DISTINCT FROM $6::int
    ORDER BY ${popularityScoreSql(
      '(SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id)',
      visibleReplyCountSql('c', '$2', '$3'),
      'c.created_at'
    )} DESC, c.id DESC
    OFFSET $4 LIMIT $5`
};

// Step 2: the pinned comment as a thread ($1 it, $2 viewer, $3 owner, $4
// post), when the viewer may see it.
const PINNED_SQL = `
  SELECT ${commentColumnsSql('c', '$2', '$3')}, ${visibleReplyCountSql('c', '$2', '$3')} AS reply_count
  FROM comments c JOIN users u ON u.id = c.user_id
  WHERE c.id = $1 AND c.post_id = $4 AND c.parent_comment_id IS NULL AND ${commentVisibleSql('c', '$2', '$3')}`;

// The first REPLY_PREVIEW replies of each of these top-level comments.
const REPLY_PREVIEW_SQL = `
  SELECT r.* FROM unnest($1::int[]) AS t(id)
  CROSS JOIN LATERAL (
    SELECT ${commentColumnsSql('c', '$2', '$3')}
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.parent_comment_id = t.id AND ${commentVisibleSql('c', '$2', '$3')}
    ORDER BY c.id
    LIMIT ${REPLY_PREVIEW}
  ) r`;

// A cursor: a whole number from 0 ('' or none: the start).
function readCursor(raw) {
  const value = raw === undefined || raw === '' ? 0 : Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

// GET /posts/:id/comments?sort=relevant|newest&cursor=&limit= (limit:
// threads, default 20, max 50) -> { sort, comments, nextCursor }:
// comments are the page's top-level comments (each with reply_count and
// is_pinned), then their first replies. The pinned one starts page 1, on
// top of the limit, and isn't part of any page's order.
async function getComments(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const sort = req.query.sort === undefined ? 'relevant' : String(req.query.sort);
    if (!SORTS.includes(sort)) return res.status(400).send('sort must be relevant or newest');
    const cursor = readCursor(req.query.cursor);
    if (cursor === null) return res.status(400).send('Invalid cursor');
    const limit = getLimit(req, { defaultLimit: 20, maxLimit: 50 });
    // Same visibility rules as GET /posts/:id -- see postVisibilityService.
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
      return res.status(404).send('Post not found');
    }
    const viewerId = req.userId ?? null;
    const pinnedId = post.pinned_comment_id ?? null;
    const top = await db.query(TOP_LEVEL_SQL[sort], [post.id, viewerId, post.user_id, cursor, limit + 1, pinnedId]);
    const pinned = pinnedId && cursor === 0 ? (await db.query(PINNED_SQL, [pinnedId, viewerId, post.user_id, post.id])).rows : [];
    const page = top.rows.slice(0, limit);
    const threads = [...pinned, ...page].map((c) => ({ ...c, is_pinned: c.id === pinnedId }));
    const replies = threads.length === 0 ? { rows: [] }
      : await db.query(REPLY_PREVIEW_SQL, [threads.map((c) => c.id), viewerId, post.user_id]);
    let nextCursor = null;
    if (top.rows.length > limit) nextCursor = sort === 'newest' ? String(page[page.length - 1].id) : String(cursor + limit);
    res.json({ sort, comments: [...threads, ...replies.rows], nextCursor });
  } catch (err) {
    sendError(res, err, 'Fetch comments failed. Please try again later.');
  }
}

// GET /comments/:id/replies?cursor=&limit= -> { replies, nextCursor }: a
// top-level comment's replies, oldest first, after the cursor's id (the
// list's first REPLY_PREVIEW are the first page's). Not found when you may
// not see the post or the comment.
async function getReplies(req, res) {
  try {
    const commentId = Number(req.params.id);
    const cursor = readCursor(req.query.cursor);
    if (cursor === null) return res.status(400).send('Invalid cursor');
    const limit = getLimit(req, { defaultLimit: 20, maxLimit: 50 });
    const viewerId = req.userId ?? null;
    const parent = (await db.query('SELECT id, post_id, user_id, parent_comment_id, awaiting_approval FROM comments WHERE id = $1', [commentId])).rows[0];
    const post = parent && !parent.parent_comment_id ? await getVisiblePost(parent.post_id, req.userId) : null;
    const seen = post && (await db.query(
      `SELECT 1 FROM comments c WHERE c.id = $1 AND ${commentVisibleSql('c', '$2', '$3')}`,
      [parent.id, viewerId, post.user_id]
    )).rows.length > 0;
    if (!seen) return res.status(404).send('Comment not found');
    const result = await db.query(
      `SELECT ${commentColumnsSql('c', '$2', '$3')}
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.parent_comment_id = $1 AND ${commentVisibleSql('c', '$2', '$3')} AND c.id > $4
       ORDER BY c.id
       LIMIT $5`,
      [parent.id, viewerId, post.user_id, cursor, limit + 1]
    );
    const replies = result.rows.slice(0, limit);
    res.json({ replies, nextCursor: result.rows.length > limit ? String(replies[replies.length - 1].id) : null });
  } catch (err) {
    sendError(res, err, 'Loading replies failed. Please try again later.');
  }
}

// Days 109-110: the post's author pins one comment (Facebook-style); a
// page's post: its owner and admins. A top-level comment on this post that
// isn't waiting for approval; pinning another replaces it.
class PinError extends HttpError {}

async function loadPinnablePost(req) {
  const post = await getVisiblePost(req.params.id, req.userId);
  if (!post) throw new PinError(404, 'Post not found');
  const mine = post.page_id ? await managesPage(post.page_id, req.userId) : post.user_id === req.userId;
  if (!mine) throw new PinError(403, 'Only the post\'s author can pin a comment.');
  return post;
}

// PUT /posts/:id/pinned-comment { commentId } -> { pinned_comment_id }
async function pinComment(req, res) {
  try {
    const post = await loadPinnablePost(req);
    const commentId = Number(req.body?.commentId);
    if (!Number.isInteger(commentId) || commentId < 1) throw new PinError(400, 'Invalid comment ID');
    const found = (await db.query('SELECT id, post_id, parent_comment_id, awaiting_approval FROM comments WHERE id = $1', [commentId])).rows[0];
    if (!found || found.post_id !== post.id) throw new PinError(400, 'That comment is not on this post.');
    if (found.parent_comment_id) throw new PinError(400, 'Only a comment, not a reply, can be pinned.');
    if (found.awaiting_approval) throw new PinError(400, 'Approve the comment before pinning it.');
    await db.query('UPDATE posts SET pinned_comment_id = $2 WHERE id = $1', [post.id, commentId]);
    res.json({ pinned_comment_id: commentId });
  } catch (err) {
    sendError(res, err, 'Pinning the comment failed. Please try again later.');
  }
}

// DELETE /posts/:id/pinned-comment -> { pinned_comment_id: null }. Nothing
// pinned is fine.
async function unpinComment(req, res) {
  try {
    const post = await loadPinnablePost(req);
    await db.query('UPDATE posts SET pinned_comment_id = NULL WHERE id = $1', [post.id]);
    res.json({ pinned_comment_id: null });
  } catch (err) {
    sendError(res, err, 'Unpinning the comment failed. Please try again later.');
  }
}

async function updateComment(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid comment ID');
    }
    const { content, error } = readContent(req.body);
    if (error) {
      return res.status(400).send(error);
    }
    const commentCheck = await db.query('SELECT * FROM comments WHERE id = $1', [req.params.id]);
    if (commentCheck.rows.length === 0) {
      return res.status(404).send('Comment not found');
    }
    if (commentCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only edit your own comments');
    }
    const result = await db.query(
      'UPDATE comments SET content = $1 WHERE id = $2 RETURNING *',
      [content, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Update comment failed. Please try again later.');
  }
}

async function deleteComment(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid comment ID');
    }
    const commentCheck = await db.query('SELECT * FROM comments WHERE id = $1', [req.params.id]);
    if (commentCheck.rows.length === 0) {
      return res.status(404).send('Comment not found');
    }
    // Day 47: the post's owner may remove any comment on it (needed to
    // turn down a restricted person's comment; Facebook and Instagram do
    // the same).
    if (commentCheck.rows[0].user_id !== req.userId) {
      const owner = await db.query('SELECT user_id FROM posts WHERE id = $1', [commentCheck.rows[0].post_id]);
      if (owner.rows[0]?.user_id !== req.userId) {
        return res.status(403).send('You can only delete your own comments');
      }
    }
    await db.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
    res.send('Comment deleted successfully');
  } catch (err) {
    sendError(res, err, 'Delete comment failed. Please try again later.');
  }
}

// Day 47: POST /comments/:id/approve -- the post's owner lets a restricted
// person's comment be seen by everyone. Anyone else: 404 (it's hidden).
async function approveComment(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid comment ID');
    }
    const result = await db.query(
      `UPDATE comments SET awaiting_approval = false
       WHERE id = $1 AND post_id IN (SELECT id FROM posts WHERE user_id = $2)
       RETURNING id, awaiting_approval`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('Comment not found');
    }
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Approving the comment failed. Please try again later.');
  }
}

// B4 comment likes. A comment can be liked by anyone who can see it: its
// post is visible to them (postVisibilityService) and there's no block
// with the comment's author. Hidden -> 404, same as posts.
async function getLikeableComment(commentId, viewerId) {
  const result = await db.query('SELECT id, post_id, user_id, awaiting_approval FROM comments WHERE id = $1', [commentId]);
  const comment = result.rows[0];
  if (!comment) return null;
  const post = await getVisiblePost(comment.post_id, viewerId);
  if (!post) return null;
  // Day 47: a comment waiting for approval exists only for its author and
  // the post's owner.
  if (comment.awaiting_approval && viewerId !== comment.user_id && viewerId !== post.user_id) return null;
  if (await blockService.isBlocked(viewerId, comment.user_id)) return null;
  return { ...comment, post };
}

async function commentLikeCount(commentId) {
  const result = await db.query('SELECT COUNT(*)::int AS count FROM comment_likes WHERE comment_id = $1', [commentId]);
  return result.rows[0].count;
}

// POST /comments/:id/like -- idempotent; notifies the author on the first
// like only.
async function likeComment(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid comment ID');
    }
    const comment = await getLikeableComment(req.params.id, req.userId);
    if (!comment) {
      return res.status(404).send('Comment not found');
    }
    // Day 50: only members comment and react in a group.
    communityService.assertCanInteract(comment.post);
    const inserted = await db.query(
      'INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING comment_id',
      [comment.id, req.userId]
    );
    if (inserted.rows.length > 0 && comment.user_id !== req.userId) {
      await notificationService.notify({ userId: comment.user_id, actorId: req.userId, type: 'comment_like', postId: comment.post_id, commentId: comment.id });
    }
    res.status(inserted.rows.length > 0 ? 201 : 200).json({ likedByMe: true, likeCount: await commentLikeCount(comment.id) });
  } catch (err) {
    sendError(res, err, 'Like comment failed. Please try again later.');
  }
}

// DELETE /comments/:id/like -- idempotent.
async function unlikeComment(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid comment ID');
    }
    const comment = await getLikeableComment(req.params.id, req.userId);
    if (!comment) {
      return res.status(404).send('Comment not found');
    }
    await db.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [comment.id, req.userId]);
    res.json({ likedByMe: false, likeCount: await commentLikeCount(comment.id) });
  } catch (err) {
    sendError(res, err, 'Unlike comment failed. Please try again later.');
  }
}

module.exports = { createComment, getComments, getReplies, pinComment, unpinComment, updateComment, deleteComment, likeComment, unlikeComment, approveComment };
