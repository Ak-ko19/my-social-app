import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 74: pass the previous page's nextCursor for the next page.
export function fetchFeed(token, { cursor = null, limit = 20 } = {}) {
  return api
    .get('/feed', { ...authHeaders(token), params: { limit, ...(cursor && { cursor }) } })
    .then((res) => res.data);
}

export function likePost(postId, token) {
  return api.post(`/posts/${postId}/like`, {}, authHeaders(token)).then((res) => res.data);
}

// Set or change the viewer's reaction (B1). Removing one is unlikePost.
export function setReaction(postId, reaction, token) {
  return api.put(`/posts/${postId}/reaction`, { reaction }, authHeaders(token)).then((res) => res.data);
}

export function unlikePost(postId, token) {
  return api.delete(`/posts/${postId}/like`, authHeaders(token)).then((res) => res.data);
}

export function followUser(userId, token) {
  return api.post(`/users/${userId}/follow`, {}, authHeaders(token));
}

export function unfollowUser(userId, token) {
  return api.delete(`/users/${userId}/follow`, authHeaders(token));
}

// Token required for a private account's post: GET comments applies the
// same visibility rules as GET /posts/:id, so an anonymous request 404s.
// Days 109-110: by thread -> { sort, comments, nextCursor }: a page of
// top-level comments (each with reply_count) in the chosen order
// ('relevant' | 'newest'), then each one's first replies.
export function fetchComments(postId, token, { cursor, sort = 'relevant' } = {}) {
  const config = { ...(token ? authHeaders(token) : {}), params: { sort, ...(cursor ? { cursor } : {}) } };
  return api.get(`/posts/${postId}/comments`, config).then((res) => res.data);
}

// Days 109-110: the post's author pins one comment to the top (another
// replaces it) -> { pinned_comment_id }.
export function pinComment(postId, commentId, token) {
  return api.put(`/posts/${postId}/pinned-comment`, { commentId }, authHeaders(token)).then((res) => res.data);
}
export function unpinComment(postId, token) {
  return api.delete(`/posts/${postId}/pinned-comment`, authHeaders(token)).then((res) => res.data);
}

// Days 109-110: more replies of a top-level comment, oldest first, after
// the reply id `cursor` -> { replies, nextCursor }.
export function fetchReplies(commentId, token, { cursor } = {}) {
  const config = { ...(token ? authHeaders(token) : {}), params: cursor ? { cursor } : undefined };
  return api.get(`/comments/${commentId}/replies`, config).then((res) => res.data);
}

// parentCommentId (optional, B4) makes it a reply; the server attaches
// replies-to-replies to the top-level comment.
export function createComment(postId, content, token, parentCommentId = null) {
  const body = parentCommentId ? { content, parentCommentId } : { content };
  return api.post(`/posts/${postId}/comments`, body, authHeaders(token)).then((res) => res.data);
}

// B4 comment likes -- both return { likedByMe, likeCount }.
export function likeComment(commentId, token) {
  return api.post(`/comments/${commentId}/like`, {}, authHeaders(token)).then((res) => res.data);
}

export function unlikeComment(commentId, token) {
  return api.delete(`/comments/${commentId}/like`, authHeaders(token)).then((res) => res.data);
}

export function updateComment(commentId, content, token) {
  return api.put(`/comments/${commentId}`, { content }, authHeaders(token)).then((res) => res.data);
}

export function deletePost(postId, token) {
  return api.delete(`/posts/${postId}`, authHeaders(token));
}

// B5 / Day 20: change only a post's audience ('public' | 'followers' | 'only_me').
export function updatePostVisibility(postId, visibility, token) {
  return api.put(`/posts/${postId}`, { visibility }, authHeaders(token)).then((res) => res.data);
}

export function updatePost(postId, content, token) {
  return api.put(`/posts/${postId}`, { content }, authHeaders(token)).then((res) => res.data);
}

// Day 96: the composer's "Edit post" -- the text and (not for group or page
// posts) the audience in one request...
export function updatePostWithAudience(postId, fields, token) {
  return api.put(`/posts/${postId}`, fields, authHeaders(token)).then((res) => res.data);
}

// ...and the photos: a form with photos (the order), images (new files) and
// altTexts. Resolves to { media }.
export function savePostPhotos(postId, formData, token) {
  return api.put(`/posts/${postId}/media`, formData, authHeaders(token)).then((res) => res.data);
}

// Days 93-94: share a post to your own feed -- { content, visibility }, both
// optional ("Share now" sends neither). Resolves to the new post.
export function sharePost(postId, { content = '', visibility = 'public' } = {}, token) {
  return api.post(`/posts/${postId}/share`, { content, visibility }, authHeaders(token)).then((res) => res.data);
}

// Public endpoint (optionalAuth on the backend) -- works for a logged-out
// viewer following a shared link, not just an authenticated in-app user.
// Passing no token omits the Authorization header entirely rather than
// sending "Bearer undefined".
export function fetchPost(postId, token) {
  return api.get(`/posts/${postId}`, token ? authHeaders(token) : undefined).then((res) => res.data);
}

export function fetchFollowCounts(userId) {
  return api.get(`/users/${userId}/follow-counts`).then((res) => res.data);
}

export function fetchFollowRequests(token) {
  return api.get('/follow-requests', authHeaders(token)).then((res) => res.data);
}

export function approveFollowRequest(followerId, token) {
  return api.post(`/follow-requests/${followerId}/approve`, {}, authHeaders(token));
}

export function denyFollowRequest(followerId, token) {
  return api.delete(`/follow-requests/${followerId}`, authHeaders(token));
}

// Day 44: vote in a poll post; resolves to the poll with its results.
export function votePoll(postId, optionId, token) {
  return api.post(`/posts/${postId}/poll/vote`, { optionId }, authHeaders(token)).then((res) => res.data);
}

// Day 47: delete a comment (yours, or any on your own post), and approve a
// restricted person's comment on your post.
export function deleteComment(commentId, token) {
  return api.delete(`/comments/${commentId}`, authHeaders(token));
}

export function approveComment(commentId, token) {
  return api.post(`/comments/${commentId}/approve`, {}, authHeaders(token)).then((res) => res.data);
}
