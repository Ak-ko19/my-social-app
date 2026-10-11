// The one way a post comes into being -- POST /posts, and (Day 45) a draft
// or scheduled post being published. Both go through the same checks, so a
// post published later is held to the rules of that moment: still in the
// group, still the page's owner (an account that's no longer active can't
// reach either path: authMiddleware for requests, the scheduler for drafts).
const db = require('../db');
const { toUnicode } = require('../utils/myanmarText');
const pollService = require('./pollService');
const hashtagService = require('./hashtagService');
const mentionService = require('./mentionService');
const { managesPage } = require('./pageAdminService');

// B5: keep in sync with migration 020's CHECK constraint.
// Day 20: 'only_me' -- seen by its author only. Day 47: 'close_friends' --
// its author and the people on their close friends list.
const POST_VISIBILITIES = ['public', 'followers', 'close_friends', 'only_me'];
// Day 43: posts had no length limit (a multipart field could be 1 MB).
const MAX_POST_LENGTH = 10000;

class PostInputError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const optionalId = (raw, name) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id)) throw new PostInputError(400, `Invalid ${name}`);
  return id;
};

// A post's fields from a request (form or JSON): { content, visibility,
// poll, communityId, pageId }, or a PostInputError(400). A draft may have
// no text yet (allowEmpty); a post must.
function readPostFields(body, { allowEmpty = false } = {}) {
  const typed = body.content ?? (allowEmpty ? '' : undefined);
  if (typeof typed !== 'string' || (!allowEmpty && typed.trim() === '')) {
    throw new PostInputError(400, 'Post content cannot be empty');
  }
  // The limit counts the text as typed (like the composer's maxLength).
  if (typed.length > MAX_POST_LENGTH) {
    throw new PostInputError(400, `Post must be ${MAX_POST_LENGTH} characters or fewer`);
  }
  // B5: audience -- 'public' unless the client asks for another.
  const visibility = body.visibility || 'public';
  if (!POST_VISIBILITIES.includes(visibility)) {
    throw new PostInputError(400, `visibility must be one of: ${POST_VISIBILITIES.join(', ')}`);
  }
  // Day 44: an optional poll; the post's text is its question.
  let poll;
  try {
    poll = pollService.parsePollInput(body.poll);
  } catch (err) {
    if (err instanceof pollService.PollError) throw new PostInputError(err.status, err.message);
    throw err;
  }
  const communityId = optionalId(body.communityId, 'communityId');
  // Day 20: "only me" is for your own profile; a group post is for the
  // group.
  if ((visibility === 'only_me' || visibility === 'close_friends') && communityId !== null) {
    throw new PostInputError(400, "Group and page posts don't have their own audience");
  }
  const pageId = optionalId(body.pageId, 'pageId');
  if (communityId !== null && pageId !== null) {
    throw new PostInputError(400, 'A post can be in a group or on a page, not both');
  }
  // Day 43: Zawgyi Myanmar text is stored as Unicode (utils/myanmarText).
  return { content: toUnicode(typed), visibility, poll, communityId, pageId };
}

// May `userId` publish `fields` (with `imageCount` photos) right now?
// Throws a PostInputError otherwise.
async function checkCanPublish(userId, fields, imageCount) {
  if (fields.content.trim() === '') {
    throw new PostInputError(400, 'Post content cannot be empty');
  }
  // Like X: a poll post has no photos.
  if (fields.poll && imageCount > 0) {
    throw new PostInputError(400, "A poll can't have photos");
  }
  await checkAudience(userId, fields);
}

// May `userId` post in the group / as the page these fields name? (Also
// asked when a draft for them is saved.)
async function checkAudience(userId, fields) {
  // B13: posting inside a community requires being a (non-pending) member.
  if (fields.communityId !== null) {
    const membership = await db.query(
      "SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = 'member'",
      [fields.communityId, userId]
    );
    if (membership.rows.length === 0) throw new PostInputError(403, 'Join this group to post in it');
  }
  // B14: posting as a page -- its owner (Day 53: or one of its admins);
  // always public.
  if (fields.pageId !== null && !(await managesPage(fields.pageId, userId))) {
    throw new PostInputError(403, "Only the page's owner and admins can post as this page");
  }
}

// Inserts the post AND its post_media rows (and poll) in one statement, so
// a post can never exist with only some of them. posts.image_url mirrors
// the first image for older readers (see migration 017). `queryable` is
// the pool or a transaction's client. Returns the posts row.
// Day 53: a page post's author is the page's OWNER, whichever admin wrote
// it -- blocks, visibility and account deletion work on the owner (B14).
async function insertPost(queryable, userId, fields, imageUrls) {
  const { content, visibility, poll, communityId, pageId } = fields;
  const result = await queryable.query(
    `WITH new_post AS (
       INSERT INTO posts (user_id, content, image_url, visibility, community_id, page_id)
       VALUES (COALESCE((SELECT owner_id FROM pages WHERE id = $7), $1), $2, $3, $5, $6, $7) RETURNING *
     ), new_media AS (
       INSERT INTO post_media (post_id, url, position)
       SELECT new_post.id, m.url, (m.ord - 1)::smallint
       FROM new_post, unnest($4::text[]) WITH ORDINALITY AS m(url, ord)
     ), new_poll AS (
       INSERT INTO polls (post_id, closes_at)
       SELECT new_post.id, now() + make_interval(hours => $8::int) FROM new_post WHERE $8::int IS NOT NULL
       RETURNING post_id
     ), new_options AS (
       INSERT INTO poll_options (post_id, position, label)
       SELECT new_poll.post_id, (o.ord - 1)::smallint, o.label
       FROM new_poll, unnest($9::text[]) WITH ORDINALITY AS o(label, ord)
     )
     SELECT * FROM new_post`,
    [userId, content, imageUrls[0] || null, imageUrls, pageId !== null ? 'public' : visibility, communityId, pageId,
      poll ? poll.durationHours : null, poll ? poll.labels : []]
  );
  return result.rows[0];
}

// After the post is saved (and committed): its hashtags and mention
// notifications. Returns the post as POST /posts answers it.
async function finishPost(row, userId, fields, imageUrls) {
  await hashtagService.syncPostHashtags(row.id, row.content);
  // The post's author (a page post: the page's owner), not whoever typed it.
  await mentionService.notifyMentions({ content: row.content, authorId: row.user_id, postId: row.id });
  return {
    ...row,
    media: imageUrls.map((url) => ({ url })),
    poll: fields.poll ? await pollService.getPoll(row.id, userId) : null
  };
}

// Checks, saves and finishes a post in one go (POST /posts).
async function createPost(userId, fields, imageUrls) {
  await checkCanPublish(userId, fields, imageUrls.length);
  const row = await insertPost(db, userId, fields, imageUrls);
  return finishPost(row, userId, fields, imageUrls);
}

module.exports = {
  POST_VISIBILITIES,
  MAX_POST_LENGTH,
  PostInputError,
  readPostFields,
  checkCanPublish,
  checkAudience,
  insertPost,
  finishPost,
  createPost
};
