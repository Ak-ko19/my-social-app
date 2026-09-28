// Deletes uploaded media (images, voice notes) from Cloudinary when the
// content that uses it is deleted -- otherwise a deleted post's photos stay
// public at their URL forever and keep using the free-tier quota.
//
// No public_id column is needed: every upload stores Cloudinary's raw
// secure_url, which always contains the resource type, version and
// public_id:
//   https://res.cloudinary.com/<cloud>/<image|video>/upload/v<n>/<public_id>.<ext>
// so it's derived from the URL for every existing and future row.
//
// Callers read the URLs BEFORE deleting the rows and call deleteMedia()
// AFTER the delete succeeded, without awaiting it: the user's delete never
// waits on (or fails because of) Cloudinary. Anything this misses -- a
// provider outage, a crash in between -- is found later by the orphan
// scan script.
const db = require('../db');
const cloudinary = require('../config/cloudinary');

const BATCH_SIZE = 100; // Cloudinary's limit per delete_resources call

function cloudName() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  return CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET ? CLOUDINARY_CLOUD_NAME : null;
}

// { publicId, resourceType } for an upload on OUR cloud, else null (other
// clouds, relative paths, transformed or malformed URLs are never touched).
function cloudinaryAsset(url, cloud = cloudName()) {
  if (!cloud || typeof url !== 'string') return null;
  const escaped = cloud.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A query/fragment (e.g. the SDK's "?_a=" analytics tag) is ignored.
  const match = url.match(new RegExp(`^https://res\\.cloudinary\\.com/${escaped}/(image|video)/upload/v\\d+/([^?#]+?)\\.[a-z0-9]+(?:[?#].*)?$`, 'i'));
  if (!match) return null;
  return { resourceType: match[1].toLowerCase(), publicId: decodeURIComponent(match[2]) };
}

// Deletes [{ publicId, resourceType }] (duplicates skipped), grouped by
// type in batches of 100. Never rejects: failed batches are logged and
// counted. Also used by scripts/cloudinary-orphans.js.
async function deleteAssets(assets, api = cloudinary.api) {
  const byType = new Map();
  for (const { publicId, resourceType } of assets) {
    if (!byType.has(resourceType)) byType.set(resourceType, new Set());
    byType.get(resourceType).add(publicId);
  }
  let deleted = 0;
  let failed = 0;
  for (const [resourceType, idSet] of byType) {
    const ids = [...idSet];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      try {
        // invalidate: CDN copies stop being served too, not just the origin.
        await api.delete_resources(batch, { resource_type: resourceType, type: 'upload', invalidate: true });
        deleted += batch.length;
      } catch (err) {
        failed += batch.length;
        console.error(`Cloudinary cleanup failed for ${batch.length} ${resourceType} file(s):`, err.message || err);
      }
    }
  }
  return { deleted, failed };
}

// Fire-and-forget: resolves when done, never rejects.
async function deleteMedia(urls) {
  const cloud = cloudName();
  if (!cloud) return;
  const assets = urls.map((url) => cloudinaryAsset(url, cloud)).filter(Boolean);
  await deleteAssets(assets);
}

// ---- Which media a delete takes with it (query BEFORE deleting). ----

async function urlsOf(sql, params) {
  const result = await db.query(sql, params);
  return result.rows.map((r) => r.url).filter(Boolean);
}

// Every image of the posts matched by `where` (a condition on `posts`).
function postMediaUrls(where, params) {
  return urlsOf(
    `SELECT posts.image_url AS url FROM posts WHERE ${where}
     UNION
     SELECT post_media.url FROM post_media JOIN posts ON posts.id = post_media.post_id WHERE ${where}`,
    params
  );
}

const mediaOfPost = (postId) => postMediaUrls('posts.id = $1', [postId]);
const mediaOfCommunity = (communityId) => postMediaUrls('posts.community_id = $1', [communityId]);
const mediaOfPage = (pageId) => postMediaUrls('posts.page_id = $1', [pageId]);

const mediaOfStory = (storyId) => urlsOf('SELECT media_url AS url FROM stories WHERE id = $1', [storyId]);
const mediaOfConversation = (conversationId) =>
  urlsOf('SELECT media_url AS url FROM messages WHERE conversation_id = $1 AND media_url IS NOT NULL', [conversationId]);

// Everything that goes when the account is deleted (FK cascades): the
// avatar, every post they wrote (incl. as their pages and in groups), their
// stories and the media they sent in messages. Groups they created survive
// (created_by is SET NULL), so other members' posts there are untouched.
async function mediaOfUser(userId) {
  const [avatar, posts, stories, messages] = await Promise.all([
    urlsOf('SELECT avatar_url AS url FROM users WHERE id = $1', [userId]),
    postMediaUrls('posts.user_id = $1', [userId]),
    urlsOf('SELECT media_url AS url FROM stories WHERE user_id = $1', [userId]),
    urlsOf('SELECT media_url AS url FROM messages WHERE sender_id = $1 AND media_url IS NOT NULL', [userId])
  ]);
  return [...avatar, ...posts, ...stories, ...messages];
}

module.exports = {
  cloudinaryAsset,
  deleteAssets,
  deleteMedia,
  mediaOfPost,
  mediaOfCommunity,
  mediaOfPage,
  mediaOfStory,
  mediaOfConversation,
  mediaOfUser
};
