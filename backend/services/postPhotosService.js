// Day 96: editing a published post's photos -- remove, add, reorder and
// describe them (Facebook's "Edit post" in the composer). The text and the
// audience stay with PUT /posts/:id.
const db = require('../db');
const postCreation = require('./postCreationService');
const { managesPage } = require('./pageAdminService');
const mediaCleanup = require('./mediaCleanupService'); // through the module, so tests can watch it
const { MAX_POST_IMAGES } = require('../middleware/cloudinaryUpload');

const { PostInputError } = postCreation;
const SHARE_HAS_NO_PHOTOS = "A share can't have photos.";

// PUT /posts/:id/media -- body.photos (the new order: kept URLs and
// { upload: i }; left out: every photo stays, new ones after) and
// body.altTexts (in that order; left out: each kept photo keeps its own).
// newUrls are this request's uploads. In one transaction, with the post's
// row locked so two edits can't interleave; the files of removed photos
// leave storage after the commit. Returns { media: [{ url, alt }] }.
async function editPhotos(userId, postId, body, newUrls) {
  const client = await db.connect();
  let before;
  let urls;
  let alts;
  try {
    await client.query('BEGIN');
    const post = (await client.query('SELECT id, user_id, page_id, is_share FROM posts WHERE id = $1 FOR UPDATE', [postId])).rows[0];
    if (!post) throw new PostInputError(404, 'Post not found');
    // Day 53: a page's posts belong to the page -- its admins edit them too.
    if (post.user_id !== userId && !(await managesPage(post.page_id, userId))) {
      throw new PostInputError(403, 'You can only edit your own posts');
    }
    before = (await client.query('SELECT url, alt_text FROM post_media WHERE post_id = $1 ORDER BY position', [postId])).rows;
    const current = before.map((m) => m.url);
    urls = postCreation.resolvePhotos(body, current, newUrls) || [...current, ...newUrls];
    if (urls.length > 0 && post.is_share) throw new PostInputError(400, SHARE_HAS_NO_PHOTOS);
    if (urls.length > 0 && (await client.query('SELECT 1 FROM polls WHERE post_id = $1', [postId])).rows.length > 0) {
      throw new PostInputError(400, "A poll can't have photos");
    }
    if (urls.length > MAX_POST_IMAGES) throw new PostInputError(400, `You can attach up to ${MAX_POST_IMAGES} images`);
    const oldAlt = new Map(before.map((m) => [m.url, m.alt_text]));
    alts = body.altTexts === undefined ? urls.map((url) => oldAlt.get(url) ?? null) : postCreation.readAltTexts(body, urls.length);

    await client.query('DELETE FROM post_media WHERE post_id = $1', [postId]);
    await client.query(
      `INSERT INTO post_media (post_id, url, position, alt_text)
       SELECT $1, m.url, (m.ord - 1)::smallint, m.alt FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS m(url, alt, ord)`,
      [postId, urls, alts]
    );
    // B2: image_url mirrors the first photo for older readers.
    await client.query('UPDATE posts SET image_url = $1 WHERE id = $2', [urls[0] ?? null, postId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  mediaCleanup.deleteMedia(before.map((m) => m.url).filter((url) => !urls.includes(url)));
  return { media: urls.map((url, i) => ({ url, alt: alts[i] })) };
}

module.exports = { editPhotos, SHARE_HAS_NO_PHOTOS };
