// Day 68: the API spec -- posts and polls, drafts and scheduled posts,
// comments, reactions, saved posts and collections, hashtags, Explore,
// profile tabs, stories and events.
const { s, ref, body, multipart, file, json, text, empty, op, q, pageQuery, cursorQuery } = require('../helpers');

const BAD_POST = text('Invalid post ID');
const POST_NOT_FOUND = text('Post not found (also when you may not see it)');
const POST_FIELDS = {
  content: s.str('Up to 10000 characters; Burmese typed in Zawgyi is stored as Unicode. A poll\'s text is its question'),
  visibility: s.enum(['public', 'followers', 'close_friends', 'only_me'], 'Default public; group and page posts have no audience of their own'),
  communityId: s.id('Post in this group (you must be a member)'),
  pageId: s.id('Publish as this page (you must be its owner or an admin)'),
  poll: s.str('A JSON object: {"options": ["A", "B"], "durationHours": 24} -- 2 to 4 different options of up to 50 characters; 24, 72 or 168 hours. No photos with a poll')
};
const POST_REFUSED = {
  400: text('Empty or too long, a bad visibility / poll / id, photos with a poll, a group and a page together'),
  403: text('Join this group to post in it / Only the page\'s owner and admins can post as this page')
};
// Day 100: what a story reply or reaction answers.
const STORY_REPLY_SENT = s.object({ conversationId: s.id('The direct chat with the author'), message: ref('Message') });
const { STORY_REACTIONS } = require('../../../config/storyReactions');
const BAD_COMMENT = text('Invalid comment ID');
const COMMENT_NOT_FOUND = text('Comment not found');
const BAD_EVENT_ID = text('Invalid event ID');
const EVENT_NOT_FOUND = text('Event not found (also when you may not see it)');
const EVENT_FIELDS = {
  name: s.str('Up to 100 characters'),
  startsAt: s.time('In the future, within a year'),
  endsAt: s.nullable(s.time('After the start, at most 31 days later; null or empty: no end time')),
  location: s.str('Up to 200 characters'),
  description: s.str('Up to 2000 characters'),
  audience: s.enum(['public', 'followers'], 'Default public')
};
const postPage = (pageKey) => json(s.object({ posts: s.array(ref('Post')), [pageKey]: s.int(), hasMore: s.bool() }), 'One page');

module.exports = {
  // ---- Posts ----
  'POST /posts': op({
    tag: 'Posts', auth: 'user', upload: true,
    summary: 'Publish a post (text, photos or a poll)',
    description: 'Hashtags are indexed and @mentions notified. Spam checks: posting too fast, the same post again, the same link '
      + 'again and again; Day 102: an account in its first day posts 3 times in 10 minutes and shares links in 3 posts or '
      + 'comments an hour (429).',
    requestBody: multipart({
      ...POST_FIELDS,
      images: s.array(file('A photo'), 'Up to 10 photos, in order (repeat the field)'),
      altTexts: s.str('Day 95: a JSON list of photo descriptions (alt text) in the same order as the photos, each a string or null, up to 1000 characters'),
      image: file('One photo (older clients; images is preferred)')
    }),
    responses: { 201: json(ref('PostRow'), 'Published'), ...POST_REFUSED }
  }),
  'GET /posts': op({
    tag: 'Posts', auth: 'optional',
    summary: 'Recent posts you may see, newest first',
    query: pageQuery({ defaultLimit: 10, maxLimit: 50 }),
    responses: { 200: postPage('currentPage') }
  }),
  'GET /feed': op({
    tag: 'Posts', auth: 'user',
    summary: 'Home: posts from you, people and pages you follow, and your groups',
    description: 'Muted people are left out. Pass nextCursor back for the next page (faster than page, which still works). '
      + 'Days 107-108: also public posts with a hashtag you follow (never from private accounts); via_hashtag names it when nothing else brought the post.',
    query: { ...pageQuery({ defaultLimit: 10, maxLimit: 50 }), cursor: cursorQuery().cursor },
    responses: {
      200: json(s.object({
        page: s.int(), limit: s.int(),
        posts: s.array({ allOf: [ref('Post'), s.object({ via_hashtag: s.nullable(s.str('The followed hashtag that brought it; null when you follow its author or page, or it is yours')) })] }),
        hasMore: s.bool(), nextCursor: s.nullable(s.str('null: no more posts'))
      }), 'One page'),
      400: text('Invalid cursor')
    }
  }),
  'GET /posts/:id': op({
    tag: 'Posts', auth: 'optional',
    summary: 'One post',
    responses: {
      200: json({ allOf: [ref('Post'), s.object({
        community_id: s.nullable(s.id()),
        group_locked: s.bool('true: a group post you can read but not comment on or react to (not a member)')
      })] }, 'The post'),
      400: BAD_POST,
      404: POST_NOT_FOUND
    }
  }),
  'PUT /posts/:id': op({
    tag: 'Posts', auth: 'user',
    summary: 'Edit your post (text and/or audience)',
    requestBody: body({ content: POST_FIELDS.content, visibility: POST_FIELDS.visibility }, { description: 'Send one or both' }),
    responses: {
      200: json(ref('PostRow'), 'Saved'),
      400: text('Invalid post ID / Nothing to update / empty (a share may be) or too long / bad visibility / group and page posts have no audience'),
      403: text('You can only edit your own posts'),
      404: POST_NOT_FOUND
    }
  }),
  'PUT /posts/:id/media': op({
    tag: 'Posts', auth: 'user', upload: true,
    summary: 'Edit the photos of your post: remove, add, reorder, describe',
    description: 'Day 96. Your post, or a post of a page you run. The text and audience stay with PUT /posts/{id}. '
      + 'Done in one step; the files of removed photos are deleted from storage afterwards. A share and a poll have no photos.',
    requestBody: multipart({
      photos: s.str('A JSON list in the new order: a URL the post already has, or {"upload": i} for the i-th of the images sent '
        + 'here (each used once). Left out: every photo stays and new ones go after them'),
      images: s.array(file('A photo'), 'New photos (up to 10 in all)'),
      altTexts: s.str('A JSON list of descriptions in the new order, each a string or null; left out: each kept photo keeps its own')
    }),
    responses: {
      200: json(s.object({ media: s.array(s.object({ url: s.str(), alt: s.nullable(s.str('Its description (alt text)')) })) }), 'Saved: the photos now'),
      400: text('Invalid post ID / Invalid photos / Invalid altTexts / too many photos / a description too long / '
        + "A share can't have photos. / A poll can't have photos"),
      403: text('You can only edit your own posts'),
      404: text('Post not found')
    }
  }),
  'POST /posts/:id/share': op({
    tag: 'Posts', auth: 'user',
    summary: 'Share a post to your own feed, with your own words',
    description: "Days 93-94, like Facebook's Share."
      + ' Only a post anyone may see can be shared (a public post of a public account, a page '
      + 'post, a post in a public group); sharing a share shares its original. The share is a post of yours: its words may be empty, '
      + "it has its own audience, and it shows the original only while that is still open to everyone. The original's author is "
      + 'notified once per person (setting: shares). Spam checks as for a post (429).',
    requestBody: body({ content: POST_FIELDS.content, visibility: POST_FIELDS.visibility }, { description: 'Both optional' }),
    responses: {
      201: json(ref('PostRow'), 'Shared'),
      400: text('Invalid post ID / too long / bad visibility'),
      403: text('Only posts that everyone can see can be shared.'),
      404: POST_NOT_FOUND
    }
  }),
  'DELETE /posts/:id': op({
    tag: 'Posts', auth: 'user',
    summary: 'Delete a post (yours, or one in a group or page you run)',
    description: 'Its photos are deleted from storage too.',
    responses: { 200: text('Post deleted successfully'), 400: BAD_POST, 403: text('You can only delete your own posts'), 404: POST_NOT_FOUND }
  }),
  'POST /posts/:id/poll/vote': op({
    tag: 'Posts', auth: 'user',
    summary: 'Vote in a poll (once; the same vote again is fine)',
    requestBody: body({ optionId: s.id() }, { required: ['optionId'] }),
    responses: {
      201: json(ref('Poll'), 'Voted: the poll with its counts'),
      200: json(ref('Poll'), 'You had already voted for this option'),
      400: text('Invalid post ID / Invalid option'),
      404: text('Post not found / This post has no poll'),
      409: text('This poll has ended / You already voted in this poll')
    }
  }),

  // ---- Drafts and scheduled posts ----
  'POST /drafts': op({
    tag: 'Drafts', auth: 'user', upload: true,
    summary: 'Save a draft, or schedule a post',
    description: 'Up to 50 drafts. With scheduledFor (5 minutes to 30 days ahead) it is published then, and must already be '
      + 'publishable now.',
    requestBody: multipart({
      ...POST_FIELDS,
      scheduledFor: s.time('When to publish it'),
      images: s.array(file('A photo'), 'Up to 10 photos'),
      altTexts: s.str('Day 95: a JSON list of photo descriptions (alt text) in the same order as the photos, each a string or null, up to 1000 characters')
    }),
    responses: { 201: json(ref('Draft'), 'Saved'), ...POST_REFUSED, 400: text('Needs text, a photo or a poll; a bad time; too many drafts; or a field refused as for POST /posts') }
  }),
  'GET /drafts': op({
    tag: 'Drafts', auth: 'user',
    summary: 'Your drafts and scheduled posts, last edited first',
    responses: { 200: json(s.array(ref('Draft')), 'All of them (at most 50)') }
  }),
  'GET /drafts/:id': op({
    tag: 'Drafts', auth: 'user',
    summary: 'One of your drafts',
    responses: { 200: json(ref('Draft'), 'The draft'), 400: text('Invalid draft ID'), 404: text('Draft not found') }
  }),
  'PUT /drafts/:id': op({
    tag: 'Drafts', auth: 'user', upload: true,
    summary: 'Replace a draft\'s contents',
    requestBody: multipart({
      ...POST_FIELDS,
      scheduledFor: s.time('Empty: not scheduled any more'),
      keepMedia: s.str('A JSON list of the photo URLs to keep, in order (new uploads go after them); left out: keep them all'),
      photos: s.str('Day 96, instead of keepMedia: the final order, each a URL the draft has or {"upload": i} for the i-th image sent here'),
      altTexts: s.str('Day 95: a JSON list of descriptions for the photos in their final order (kept, then new); left out: kept photos keep theirs'),
      images: s.array(file('A photo'))
    }),
    responses: { 200: json(ref('Draft'), 'Saved'), ...POST_REFUSED, 404: text('Draft not found') }
  }),
  'PUT /drafts/:id/schedule': op({
    tag: 'Drafts', auth: 'user',
    summary: 'Schedule a draft, move its time, or unschedule it',
    requestBody: body({ scheduledFor: s.nullable(s.time('null or empty: back to a plain draft')) }, { required: ['scheduledFor'] }),
    responses: {
      200: json(ref('Draft'), 'Saved'),
      400: text('Invalid scheduledFor / too soon / too far ahead / not publishable as it is'),
      403: POST_REFUSED[403],
      404: text('Draft not found')
    }
  }),
  'DELETE /drafts/:id': op({
    tag: 'Drafts', auth: 'user',
    summary: 'Delete a draft (and its photos)',
    responses: { 200: json(s.object({ deleted: { const: true } }), 'Deleted'), 400: text('Invalid draft ID'), 404: text('Draft not found') }
  }),
  'POST /drafts/:id/publish': op({
    tag: 'Drafts', auth: 'user',
    summary: 'Publish a draft now',
    responses: { 201: json(ref('PostRow'), 'Published (the draft is gone)'), ...POST_REFUSED, 404: text('Draft not found') }
  }),

  // ---- Comments ----
  'POST /posts/:id/comments': op({
    tag: 'Comments', auth: 'user',
    summary: 'Comment on a post, or reply to a comment',
    description: 'A restricted person\'s comment waits for the post owner\'s approval and only they two see it. The author is '
      + 'notified, and so is the person replied to. Spam checks: commenting too fast, the same comment again; an account in its first day comments 10 times in 10 minutes (429).',
    requestBody: body({
      content: s.str('Up to 5000 characters'),
      parentCommentId: s.id('Reply to this comment (a reply to a reply joins the same thread)')
    }, { required: ['content'] }),
    responses: {
      201: json({ allOf: [ref('CommentRow'), s.object({ like_count: { const: 0 }, liked_by_me: { const: false } })] }, 'Posted'),
      400: text('Invalid post ID / empty or too long / Invalid parent comment'),
      403: text('Join this group to comment and react / This person limits who can comment on their posts'),
      404: POST_NOT_FOUND,
      429: { $ref: '#/components/responses/TooManyRequests' }
    }
  }),
  'GET /posts/:id/comments': op({
    tag: 'Comments', auth: 'optional',
    summary: "A post's comments by thread, a page at a time: Most relevant or Newest",
    description: 'Days 109-110. A page is `limit` top-level comments in the chosen order (each with reply_count), followed by '
      + 'the first 2 replies of each, oldest first; GET /comments/{id}/replies has the rest. Most relevant ranks by reactions, '
      + 'replies and age (ranks move, so a later page can repeat a comment). The pinned comment (is_pinned) starts the first page, '
      + 'on top of the limit, and is never part of the order. Comments from people you have a block with are left out.',
    query: {
      sort: q(s.enum(['relevant', 'newest'], 'Default relevant')),
      cursor: q(s.str('The nextCursor of the page before (a whole number)')),
      limit: q(s.int('Threads per page, 1 to 50', { default: 20 }))
    },
    responses: {
      200: json(s.object({ sort: s.enum(['relevant', 'newest']), comments: s.array(ref('Comment')), nextCursor: s.nullable(s.str('null: no more comments')) }), 'One page'),
      400: text('Invalid post ID / Invalid cursor / sort must be relevant or newest'),
      404: POST_NOT_FOUND
    }
  }),
  'PUT /posts/:id/pinned-comment': op({
    tag: 'Comments', auth: 'user',
    summary: 'Pin a comment to the top of your post (one at a time; a page\'s post: its owner and admins)',
    description: 'Days 109-110. A comment, not a reply, on this post and not waiting for approval. Pinning another replaces it.',
    requestBody: body({ commentId: s.id() }, { required: ['commentId'] }),
    responses: {
      200: json(s.object({ pinned_comment_id: s.id() }), 'Pinned'),
      400: text('Invalid comment ID / That comment is not on this post. / Only a comment, not a reply, can be pinned. / Approve the comment before pinning it. / Invalid ids'),
      403: text("Only the post's author can pin a comment."),
      404: POST_NOT_FOUND
    }
  }),
  'DELETE /posts/:id/pinned-comment': op({
    tag: 'Comments', auth: 'user',
    summary: 'Unpin the comment at the top of your post',
    description: 'Nothing pinned is fine.',
    responses: {
      200: json(s.object({ pinned_comment_id: { type: 'null' } }), 'Unpinned'),
      400: text('Invalid ids'),
      403: text("Only the post's author can pin a comment."),
      404: POST_NOT_FOUND
    }
  }),
  'GET /comments/:id/replies': op({
    tag: 'Comments', auth: 'optional',
    summary: "A comment's replies, oldest first, a page at a time",
    description: 'Days 109-110. The same comments the list would show you. Not found when you may not see the post or the comment.',
    pathParams: { id: s.id('A top-level comment') },
    query: cursorQuery({ defaultLimit: 20, maxLimit: 50 }),
    responses: {
      200: json(s.object({ replies: s.array(ref('Comment')), nextCursor: s.nullable(s.str('null: no more replies')) }), 'One page'),
      400: text('Invalid cursor / Invalid ids'),
      404: text('Comment not found')
    }
  }),
  'PUT /comments/:id': op({
    tag: 'Comments', auth: 'user',
    summary: 'Edit your comment',
    requestBody: body({ content: s.str('Up to 5000 characters') }, { required: ['content'] }),
    responses: {
      200: json(ref('CommentRow'), 'Saved'),
      400: text('Invalid comment ID / empty or too long'),
      403: text('You can only edit your own comments'),
      404: COMMENT_NOT_FOUND
    }
  }),
  'DELETE /comments/:id': op({
    tag: 'Comments', auth: 'user',
    summary: 'Delete a comment (yours, or any on your post)',
    responses: { 200: text('Comment deleted successfully'), 400: BAD_COMMENT, 403: text('You can only delete your own comments'), 404: COMMENT_NOT_FOUND }
  }),
  'POST /comments/:id/approve': op({
    tag: 'Comments', auth: 'user',
    summary: "Approve a restricted person's comment on your post",
    responses: {
      200: json(s.object({ id: s.id(), awaiting_approval: { const: false } }), 'Approved: everyone sees it now'),
      400: BAD_COMMENT,
      404: text('Comment not found (or not on your post)')
    }
  }),
  'POST /comments/:id/like': op({
    tag: 'Comments', auth: 'user',
    summary: 'Like a comment',
    responses: {
      201: json(s.object({ likedByMe: { const: true }, likeCount: s.int() }), 'Liked'),
      200: json(s.object({ likedByMe: { const: true }, likeCount: s.int() }), 'Already liked'),
      400: BAD_COMMENT,
      403: text('Join this group to comment and react'),
      404: COMMENT_NOT_FOUND
    }
  }),
  'DELETE /comments/:id/like': op({
    tag: 'Comments', auth: 'user',
    summary: 'Unlike a comment',
    responses: { 200: json(s.object({ likedByMe: { const: false }, likeCount: s.int() }), 'Unliked'), 400: BAD_COMMENT, 404: COMMENT_NOT_FOUND }
  }),

  // ---- Reactions ----
  'POST /posts/:id/like': op({
    tag: 'Reactions', auth: 'user',
    summary: 'Like a post (the "like" reaction)',
    responses: {
      201: json({ allOf: [ref('ReactionSummary'), s.object({ message: s.str(), myReaction: { const: 'like' } })] }, 'Liked'),
      400: text('Invalid post ID / You already liked this post'),
      403: text('Join this group to comment and react'),
      404: POST_NOT_FOUND
    }
  }),
  'DELETE /posts/:id/like': op({
    tag: 'Reactions', auth: 'user',
    summary: 'Remove your reaction from a post',
    responses: {
      200: json({ allOf: [ref('ReactionSummary'), s.object({ message: s.str(), myReaction: { type: 'null' } })] }, 'Removed'),
      400: BAD_POST,
      404: text('You have not liked this post')
    }
  }),
  'PUT /posts/:id/reaction': op({
    tag: 'Reactions', auth: 'user',
    summary: 'React to a post, or change your reaction',
    requestBody: body({ reaction: s.enum(['like', 'love', 'haha', 'wow', 'sad', 'angry']) }, { required: ['reaction'] }),
    responses: {
      201: json({ allOf: [ref('ReactionSummary'), s.object({ myReaction: s.str() })] }, 'Reacted'),
      200: json({ allOf: [ref('ReactionSummary'), s.object({ myReaction: s.str() })] }, 'Reaction changed'),
      400: text('Invalid post ID / reaction must be one of: like, love, haha, wow, sad, angry'),
      403: text('Join this group to comment and react'),
      404: POST_NOT_FOUND
    }
  }),
  'GET /posts/:id/likes': op({
    tag: 'Reactions', auth: 'optional',
    summary: "A post's reaction counts",
    responses: {
      200: json({ allOf: [ref('ReactionSummary'), s.object({ postId: s.id() })] }, 'The counts'),
      400: BAD_POST,
      404: POST_NOT_FOUND
    }
  }),

  // ---- Saved posts and collections ----
  'POST /posts/:id/bookmark': op({
    tag: 'Saved', auth: 'user',
    summary: 'Save a post',
    responses: { 201: text('Post bookmarked successfully'), 400: text('Invalid post ID / You have already bookmarked this post'), 404: POST_NOT_FOUND }
  }),
  'DELETE /posts/:id/bookmark': op({
    tag: 'Saved', auth: 'user',
    summary: 'Unsave a post (it leaves your collections too)',
    responses: { 200: text('Post unbookmarked successfully'), 400: BAD_POST, 404: text('You have not bookmarked this post') }
  }),
  'GET /bookmarks': op({
    tag: 'Saved', auth: 'user',
    summary: 'Your saved posts that you may still see, last saved first',
    query: pageQuery({ defaultLimit: 10, maxLimit: 50 }),
    responses: { 200: postPage('page') }
  }),
  'GET /collections': op({
    tag: 'Saved', auth: 'user',
    summary: 'Your collections of saved posts',
    responses: { 200: json(s.array(ref('Collection')), 'Up to 30') }
  }),
  'POST /collections': op({
    tag: 'Saved', auth: 'user',
    summary: 'Create a collection',
    requestBody: body({ name: s.str('Up to 50 characters, unique among yours') }, { required: ['name'] }),
    responses: {
      201: json(ref('Collection'), 'Created'),
      400: text('A collection needs a name / too long / You can have up to 30 collections'),
      409: text('You already have a collection with that name')
    }
  }),
  'PATCH /collections/:id': op({
    tag: 'Saved', auth: 'user',
    summary: 'Rename a collection',
    requestBody: body({ name: s.str('Up to 50 characters') }, { required: ['name'] }),
    responses: {
      200: json(ref('Collection'), 'Renamed'),
      400: text('Invalid collection ID / a bad name'),
      404: text('Collection not found'),
      409: text('You already have a collection with that name')
    }
  }),
  'DELETE /collections/:id': op({
    tag: 'Saved', auth: 'user',
    summary: 'Delete a collection (its posts stay saved)',
    responses: { 200: json(s.object({ deleted: { const: true } }), 'Deleted'), 400: text('Invalid collection ID'), 404: text('Collection not found') }
  }),
  'GET /collections/:id/posts': op({
    tag: 'Saved', auth: 'user',
    summary: "A collection's posts, last added first",
    query: pageQuery({ defaultLimit: 10, maxLimit: 50 }),
    responses: {
      200: json(s.object({ page: s.int(), collection: ref('Collection'), posts: s.array(ref('Post')), hasMore: s.bool() }), 'One page'),
      400: text('Invalid collection ID'),
      404: text('Collection not found')
    }
  }),
  'GET /posts/:id/collections': op({
    tag: 'Saved', auth: 'user',
    summary: 'Which of your collections a post is in',
    responses: { 200: json(s.object({ collectionIds: s.array(s.id()) }), 'The collection ids'), 400: BAD_POST }
  }),
  'PUT /posts/:id/collections': op({
    tag: 'Saved', auth: 'user',
    summary: 'Put a post in exactly these collections (saving it if needed)',
    requestBody: body({ collectionIds: s.array(s.id(), 'Your collections; [] keeps it saved but in none') }, { required: ['collectionIds'] }),
    responses: {
      200: json(s.object({ saved: { const: true }, collectionIds: s.array(s.id()) }), 'Saved'),
      400: text('Invalid post ID / collectionIds must be a list of ids'),
      404: text('Post not found / Collection not found')
    }
  }),

  // ---- Hashtags and Explore ----
  'GET /hashtags/:tag/posts': op({
    tag: 'Explore', auth: 'optional',
    summary: 'Posts with a hashtag',
    pathParams: { tag: s.str('The hashtag, without # (any language)') },
    query: { sort: q(s.enum(['recent', 'top'], 'Default recent; top ranks the newest 500 by reactions and comments')), ...pageQuery({ defaultLimit: 10, maxLimit: 50 }) },
    responses: {
      200: json(s.object({ tag: s.str('As stored (lower-case)'), sort: s.enum(['recent', 'top']), page: s.int(), posts: s.array(ref('Post')), hasMore: s.bool() }), 'One page'),
      400: text('A hashtag is required / Sort must be recent or top')
    }
  }),
  // Days 107-108: following a hashtag.
  'GET /hashtags/:tag': op({
    tag: 'Explore', auth: 'optional',
    summary: 'A hashtag, and whether you follow it',
    pathParams: { tag: s.str('The hashtag, with or without # (any language)') },
    responses: {
      200: json(s.object({ tag: s.str('As stored (lower-case)'), is_following: s.bool('false when logged out') }), 'The hashtag'),
      400: text('That is not a hashtag. Use letters, numbers and _ only.')
    }
  }),
  'PUT /hashtags/:tag/follow': op({
    tag: 'Explore', auth: 'user',
    summary: 'Follow a hashtag: its public posts come to your Home (up to 200 hashtags)',
    description: 'Following again is fine. A hashtag no post has used yet can be followed too.',
    pathParams: { tag: s.str('The hashtag, with or without # (any language)') },
    responses: {
      200: json(s.object({ tag: s.str(), is_following: { const: true } }), 'Following'),
      400: text('That is not a hashtag. Use letters, numbers and _ only. / You can follow up to 200 hashtags.')
    }
  }),
  'DELETE /hashtags/:tag/follow': op({
    tag: 'Explore', auth: 'user',
    summary: 'Stop following a hashtag',
    description: 'Not following it is fine.',
    pathParams: { tag: s.str('The hashtag, with or without # (any language)') },
    responses: {
      200: json(s.object({ tag: s.str(), is_following: { const: false } }), 'Not following'),
      400: text('That is not a hashtag. Use letters, numbers and _ only.')
    }
  }),
  'GET /followed-hashtags': op({
    tag: 'Explore', auth: 'user',
    summary: 'The hashtags you follow, latest followed first (all of them)',
    responses: {
      200: json(s.object({ hashtags: s.array(s.object({ tag: s.str(), followed_at: s.time() })), max: s.int('How many you may follow') }), 'Yours')
    }
  }),
  'GET /explore/hashtags': op({
    tag: 'Explore', auth: 'optional',
    summary: 'Trending hashtags (the 10 most used in the last week, in posts you may see)',
    responses: { 200: json(s.array(s.object({ tag: s.str(), post_count: s.int() })), 'The hashtags') }
  }),
  'GET /explore/posts': op({
    tag: 'Explore', auth: 'optional',
    summary: 'Popular posts of the last week that you may see',
    description: 'Ranked by reactions and comments, with newer posts ahead. Muted people are left out.',
    query: pageQuery({ defaultLimit: 10, maxLimit: 30 }),
    responses: { 200: postPage('currentPage') }
  }),
  'GET /memories': op({
    tag: 'Posts', auth: 'user',
    summary: 'Memories: your posts from this day in earlier years',
    description: 'Days 83-84. Your own profile posts (not in groups or as a page), whatever their audience, made on the same month '
      + 'and day in an earlier year -- read in your time zone. A Feb 29 post comes back on Feb 28 in years without one. At most 100.',
    query: {
      tz: q(s.str('Your time zone (IANA name, e.g. Europe/London); default UTC')),
      date: q(s.str('Today, YYYY-MM-DD; default today in tz'))
    },
    responses: {
      200: json(s.object({
        date: s.str('The day used (YYYY-MM-DD)'),
        memories: s.array(s.object({
          yearsAgo: s.int(), year: s.int(), posts: s.array(ref('Post'))
        }), 'One entry per earlier year that has posts, the most recent year first')
      }), 'Your memories'),
      400: text('An unknown time zone or a date that is not YYYY-MM-DD')
    }
  }),
  'GET /users/:id/posts': op({
    tag: 'Posts', auth: 'optional',
    summary: "A profile's posts, photos, or posts they are tagged in",
    description: 'On the posts tab the pinned post comes separately in `pinned` (first page only).',
    query: { tab: q(s.enum(['posts', 'photos', 'tagged'], 'Default posts')), ...pageQuery({ defaultLimit: 12, maxLimit: 50 }) },
    responses: {
      200: json(s.object({ posts: s.array(ref('Post')), pinned: s.nullable(ref('Post')), currentPage: s.int(), hasMore: s.bool() }), 'One page'),
      400: text('Invalid user ID / tab must be one of: posts, photos, tagged'),
      403: text('This account is private'),
      404: text('User not found (also when deactivated or there is a block between you)')
    }
  }),

  // ---- Stories ----
  'POST /stories': op({
    tag: 'Stories', auth: 'user', upload: true,
    summary: 'Add a photo story (gone after 24 hours)',
    requestBody: multipart({ image: file('The photo'), closeFriends: s.enum(['true', 'false'], 'true: close friends only') }, { required: ['image'] }),
    responses: { 201: json({ allOf: [ref('Story'), s.object({ user_id: s.id() })] }, 'Added'), 400: text('A story needs an image, or a refused file') }
  }),
  'GET /stories': op({
    tag: 'Stories', auth: 'user',
    summary: 'The stories tray: yours first, then unseen, then newest',
    description: 'Stories of people you follow (close-friends ones only if you are on their list), never of muted or blocked people.',
    responses: { 200: json(s.array(ref('StoryGroup')), 'One entry per person') }
  }),
  'POST /stories/:id/view': op({
    tag: 'Stories', auth: 'user',
    summary: 'Mark a story seen',
    responses: { 204: empty('Marked'), 400: text('Invalid story ID'), 404: text('Story not found (also when you may not see it)') }
  }),
  'DELETE /stories/:id': op({
    tag: 'Stories', auth: 'user',
    summary: 'Delete your story (and its photo)',
    responses: { 200: text('Story deleted'), 400: text('Invalid story ID'), 403: text('You can only delete your own story'), 404: text('Story not found') }
  }),

  'POST /stories/:id/reply': op({
    tag: 'Stories', auth: 'user',
    summary: "Reply to a story: a message to its author, with the story attached",
    description: 'Day 100 (Instagram). Opens the direct chat when there is none yet; every check a send has applies '
      + '(blocks, "who can message me", the send rate limit). The message also goes out live as new_message.',
    requestBody: body({ text: s.str('Up to 5000 characters') }, { required: ['text'] }),
    responses: {
      201: json(STORY_REPLY_SENT, 'Sent'),
      400: text("Invalid story ID, empty or too long text, or your own story (You can't reply to your own story)"),
      403: text("You cannot message this user / This person isn't accepting messages from you"),
      404: text('Story not found (also expired, or one you may not see)'),
      429: text('You are sending messages too quickly. Please slow down.')
    }
  }),
  'POST /stories/:id/react': op({
    tag: 'Stories', auth: 'user',
    summary: 'React to a story with an emoji: sent to its author as a message',
    description: 'Day 100. The emoji is the message (like Instagram); the same checks as a reply.',
    requestBody: body({ emoji: s.enum(STORY_REACTIONS) }, { required: ['emoji'] }),
    responses: {
      201: json(STORY_REPLY_SENT, 'Sent'),
      400: text("Invalid story ID, not one of the reactions (Choose one of the story reactions), or your own story"),
      403: text("You cannot message this user / This person isn't accepting messages from you"),
      404: text('Story not found (also expired, or one you may not see)'),
      429: text('You are sending messages too quickly. Please slow down.')
    }
  }),

  // ---- Events ----
  'POST /events': op({
    tag: 'Events', auth: 'user',
    summary: 'Create an event',
    requestBody: body(EVENT_FIELDS, { required: ['name', 'startsAt'] }),
    responses: { 201: json(ref('Event'), 'Created'), 400: text('A missing name or start, a bad time, a field too long, or a bad audience') }
  }),
  'GET /events': op({
    tag: 'Events', auth: 'user',
    summary: 'Your events (hosting or answered), or events to discover',
    query: { section: q(s.enum(['mine', 'discover'], 'Default mine')), ...pageQuery({ defaultLimit: 20, maxLimit: 50 }) },
    responses: {
      200: json(s.object({ events: s.array(ref('Event')), page: s.int(), hasMore: s.bool() }), 'One page, soonest first'),
      400: text('section must be mine or discover')
    }
  }),
  'GET /events/:id': op({
    tag: 'Events', auth: 'optional',
    summary: 'One event',
    description: 'A followers-only event is visible to the host\'s followers; a public one to everyone, logged out too.',
    responses: { 200: json(ref('Event'), 'The event'), 400: BAD_EVENT_ID, 404: EVENT_NOT_FOUND }
  }),
  'PATCH /events/:id': op({
    tag: 'Events', auth: 'user',
    summary: 'Edit your event',
    requestBody: body(EVENT_FIELDS, { description: 'Only the fields you send change' }),
    responses: {
      200: json(ref('Event'), 'Saved'),
      400: text('Invalid event ID / Nothing to update / cancelled or ended / a bad field'),
      403: text('Only the host can do that'),
      404: EVENT_NOT_FOUND
    }
  }),
  'DELETE /events/:id': op({
    tag: 'Events', auth: 'user',
    summary: 'Delete your event',
    responses: { 200: json(s.object({ deleted: { const: true } }), 'Deleted'), 400: BAD_EVENT_ID, 403: text('Only the host can do that'), 404: EVENT_NOT_FOUND }
  }),
  'POST /events/:id/cancel': op({
    tag: 'Events', auth: 'user',
    summary: 'Cancel your event (it stays visible, marked cancelled)',
    description: 'Everyone who answered is notified.',
    responses: {
      200: json(ref('Event'), 'Cancelled'),
      400: text('Invalid event ID / This event has ended'),
      403: text('Only the host can do that'),
      404: EVENT_NOT_FOUND
    }
  }),
  'PUT /events/:id/response': op({
    tag: 'Events', auth: 'user',
    summary: 'Say Going or Interested',
    requestBody: body({ status: s.enum(['going', 'interested']) }, { required: ['status'] }),
    responses: {
      200: json(ref('Event'), 'Saved'),
      400: text("Invalid event ID / a bad status / You're hosting this event / cancelled or ended"),
      404: EVENT_NOT_FOUND
    }
  }),
  'DELETE /events/:id/response': op({
    tag: 'Events', auth: 'user',
    summary: 'Take back your answer',
    responses: {
      200: json({ oneOf: [ref('Event'), s.object({ id: s.id(), my_response: { type: 'null' } }, { extra: false })] }, 'Done (just the id when you may no longer see the event)'),
      400: BAD_EVENT_ID
    }
  }),
  'GET /events/:id/guests': op({
    tag: 'Events', auth: 'optional',
    summary: 'Who is going (or interested), newest answer first',
    query: { status: q(s.enum(['going', 'interested'], 'Default going')), ...pageQuery({ defaultLimit: 20, maxLimit: 50 }) },
    responses: {
      200: json(s.object({
        guests: s.array(s.object({ id: s.id(), username: s.str(), avatar_url: s.nullable(s.str()), answered_at: s.time() })),
        page: s.int(), hasMore: s.bool()
      }), 'One page'),
      400: text('Invalid event ID / status must be one of: going, interested'),
      404: EVENT_NOT_FOUND
    }
  })
};
