// Single place that parses #hashtags out of post content and keeps the
// hashtags/post_hashtags tables in sync -- both createPost and updatePost
// call into this instead of duplicating the parse/upsert logic.
const db = require('../db');

const MAX_TAG_LENGTH = 100;
// Word characters only (letters/digits/underscore) -- matches the common
// hashtag convention (no spaces/punctuation inside a tag) and keeps the
// regex simple and safe against pathological input.
const HASHTAG_REGEX = /#(\w+)/g;

function parseHashtags(content) {
  if (!content) return [];
  const matches = content.matchAll(HASHTAG_REGEX);
  const tags = new Set();
  for (const match of matches) {
    const tag = match[1].slice(0, MAX_TAG_LENGTH);
    // A bare "#" or "#123" made of only digits isn't a useful tag, but
    // digits mixed with letters (e.g. "#web3") are fine -- only reject
    // all-digit matches.
    if (tag && !/^\d+$/.test(tag)) {
      tags.add(tag.toLowerCase());
    }
  }
  return [...tags];
}

// Replaces a post's hashtag links with exactly the set parsed from its
// current content -- correct for both create (no existing links to
// remove) and edit (old tags no longer present must be unlinked, same as
// any tag-sync operation).
async function syncPostHashtags(postId, content) {
  const tags = parseHashtags(content);

  await db.query('DELETE FROM post_hashtags WHERE post_id = $1', [postId]);
  if (tags.length === 0) return;

  // ON CONFLICT DO NOTHING then a separate SELECT (rather than a single
  // RETURNING) -- an upsert's RETURNING only reports rows it actually
  // inserted, so a tag that already existed would silently be missing from
  // the id list otherwise.
  await db.query(
    `INSERT INTO hashtags (tag) SELECT unnest($1::text[]) ON CONFLICT (LOWER(tag)) DO NOTHING`,
    [tags]
  );
  const idsResult = await db.query(
    `SELECT id FROM hashtags WHERE LOWER(tag) = ANY($1::text[])`,
    [tags]
  );

  if (idsResult.rows.length === 0) return;

  // Parameterized multi-row insert (not string-interpolated VALUES) even
  // though postId/hashtag ids are both already-validated integers here --
  // keeps this the one place in the codebase that builds a dynamic VALUES
  // list, so it stays the same safe shape as every other query regardless.
  const placeholders = idsResult.rows.map((_, i) => `($1, $${i + 2})`).join(', ');
  const params = [postId, ...idsResult.rows.map((row) => row.id)];
  await db.query(
    `INSERT INTO post_hashtags (post_id, hashtag_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    params
  );
}

module.exports = { parseHashtags, syncPostHashtags };
