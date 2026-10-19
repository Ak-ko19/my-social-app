const db = require('../db');
const { sendError } = require('../utils/httpError');
const mentionService = require('../services/mentionService');
const { getVisiblePost } = require('../services/postVisibilityService');
const blockService = require('../services/blockService');
const notificationService = require('../services/notificationService');
const { toUnicode } = require('../utils/myanmarText');
const { isRestricted } = require('../services/restrictService');
const interactionService = require('../services/interactionService');
const spamService = require('../services/spamService');
const communityService = require('../services/communityService');

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

async function getComments(req, res) {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    // Same visibility rules as GET /posts/:id -- see postVisibilityService.
    const post = await getVisiblePost(req.params.id, req.userId);
    if (!post) {
      return res.status(404).send('Post not found');
    }
    // Also hide individual comments from anyone the viewer has a block with
    // (either direction), same mutual-invisibility rule as everywhere else.
    const viewerId = req.userId ?? null;
    const result = await db.query(`
      SELECT comments.id, comments.content, comments.created_at, comments.parent_comment_id,
        users.id AS user_id, users.username,
        (SELECT COUNT(*)::int FROM comment_likes cl WHERE cl.comment_id = comments.id) AS like_count,
        $2::int IS NOT NULL AND EXISTS(
          SELECT 1 FROM comment_likes cl WHERE cl.comment_id = comments.id AND cl.user_id = $2
        ) AS liked_by_me,
        -- Day 47: only the post's owner learns a comment is waiting.
        (comments.awaiting_approval AND $2::int = $3::int) AS awaiting_approval
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.post_id = $1
        -- Waiting for approval: seen by its author and the post's owner only.
        AND (NOT comments.awaiting_approval OR comments.user_id = $2 OR $2::int = $3::int)
        AND ($2::int IS NULL OR NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocks.blocker_id = $2 AND blocks.blocked_id = comments.user_id)
             OR (blocks.blocker_id = comments.user_id AND blocks.blocked_id = $2)
        ))
      ORDER BY comments.created_at ASC
    `, [req.params.id, viewerId, post.user_id]);
    res.json(result.rows);
  } catch (err) {
    sendError(res, err, 'Fetch comments failed. Please try again later.');
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

module.exports = { createComment, getComments, updateComment, deleteComment, likeComment, unlikeComment, approveComment };
