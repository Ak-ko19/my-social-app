const db = require('../db');
const { validZone } = require('../utils/timeZone');
const interactionService = require('../services/interactionService');
const { APP_LANGUAGES, isAppLanguage } = require('../config/languages');
const { sendError } = require('../utils/httpError');
const { deleteMedia } = require('../services/mediaCleanupService');
const blockService = require('../services/blockService');
const { buildExport } = require('../services/dataExportService');
const { parseLinks, LINKS_ERROR } = require('../utils/profileLinks');
const { toUnicode } = require('../utils/myanmarText');
const { textOf } = require('../utils/bodyText');

// Day 43: bios had no limit. Generous next to Instagram (150) or X (160),
// so existing bios still save.
const MAX_BIO_LENGTH = 500;

// Same check signup uses (authController.EMAIL_REGEX).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getMyProfile(req, res) {
  try {
    const result = await db.query('SELECT id, username, email, bio, links, avatar_url, cover_url, is_private, email_verified, is_admin, language, message_permission, comment_permission, onboarded_at, created_at FROM users WHERE id = $1', [req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Error fetching profile. Please try again later.');
  }
}

// Day 28: GET /profile/export -- "Download your information": the
// account's own data as a JSON file (see services/dataExportService.js for
// what is and isn't in it).
async function exportMyData(req, res) {
  try {
    const data = await buildExport(req.userId);
    if (!data) return res.status(404).send('User not found');
    const name = data.profile.username.replace(/[^A-Za-z0-9_.-]/g, '_');
    const date = data.exported_at.slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="mysocialapp-${name}-${date}.json"`);
    res.set('Cache-Control', 'no-store');
    res.type('application/json').send(JSON.stringify(data, null, 2));
  } catch (err) {
    sendError(res, err, 'Preparing your data failed. Please try again later.');
  }
}

async function getProfile(req, res) {
  try {
    const { id } = req.params;
    // Accepts either a numeric user id or a username -- @mention links
    // (PostText on the frontend) only ever have the username text to link
    // with, not the id, so this one endpoint serves both /profile/:id and
    // a mention's /profile/:username without a second lookup endpoint.
    const isUsername = isNaN(id);
    // Public profile endpoint (optionalAuth) — deliberately excludes email; see getMyProfile for the owner-only view.
    // is_following/is_blocked_by_me let the profile screen render the
    // right Follow/Unfollow/Block button state without a second request.
    const viewerId = req.userId ?? null;
    const result = await db.query(`
      SELECT id, username, bio, links, avatar_url, cover_url, is_private, is_deactivated, created_at,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = users.id AND status = 'accepted') AS is_following,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = users.id AND status = 'pending') AS follow_request_pending,
        -- Day 37: they follow the viewer (the button then says Follow back).
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM follows WHERE follower_id = users.id AND following_id = $1 AND status = 'accepted') AS follows_you,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = users.id) AS is_blocked_by_me,
        -- Day 47: only ever about the viewer's own choice.
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM user_mutes WHERE muter_id = $1 AND muted_id = users.id) AS is_muted_by_me,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM user_restrictions WHERE restricter_id = $1 AND restricted_id = users.id) AS is_restricted_by_me
      FROM users WHERE ${isUsername ? 'LOWER(username) = LOWER($2)' : 'id = $2::int'}
    `, [viewerId, id]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const profile = result.rows[0];

    // A deactivated account's profile is hidden from everyone but the
    // owner themselves (viewing it while their own JWT is still valid,
    // right before their next login reactivates it).
    if (profile.is_deactivated && viewerId !== profile.id) {
      return res.status(404).send('User not found');
    }

    // Mutual invisibility: a block hides the profile in both directions,
    // same as it hides posts (postController.getPost/getPosts) and search
    // results (searchController) — this is the same underlying rule applied
    // to one more surface, not a separate policy. Uses profile.id (the
    // resolved numeric id from the query above), not the raw :id route
    // param, since that may have been a username -- isBlocked itself
    // already checks both directions (viewer blocked them, or they blocked
    // viewer), unlike the query's own is_blocked_by_me field (one direction
    // only, kept separate since the frontend needs it to render an
    // Unblock, not just hide the page).
    if (viewerId && (await blockService.isBlocked(viewerId, profile.id))) {
      return res.status(404).send('User not found');
    }
    // Day 47: whether the viewer may message them (their setting), so the
    // Message button can say so instead of failing.
    profile.can_message = Boolean(viewerId) && viewerId !== profile.id && (await interactionService.canMessage(viewerId, profile.id));

    res.status(200).json(profile);
  } catch (err) {
    sendError(res, err, 'Error fetching profile. Please try again later.');
  }
}

async function updateProfile(req, res) {
  // A new avatar is already on Cloudinary by the time this runs.
  const avatarUrl = req.cloudinaryResult ? req.cloudinaryResult.secure_url : null;
  try {
    const username = textOf(req.body.username).trim();
    const email = textOf(req.body.email).trim();
    const typedBio = req.body.bio;
    if (!username || !email) {
      return res.status(400).send('Username and email are required');
    }
    if (typedBio !== undefined && typedBio !== null && typeof typedBio !== 'string') {
      return res.status(400).send('Invalid bio');
    }
    // The limit counts the text as typed (like the bio field's maxLength).
    if (typedBio && typedBio.length > MAX_BIO_LENGTH) {
      return res.status(400).send(`Bio must be ${MAX_BIO_LENGTH} characters or fewer`);
    }
    // Day 43: Zawgyi Myanmar text is stored as Unicode (utils/myanmarText).
    // Not the username: it is how people find and mention you.
    const bio = toUnicode(typedBio);
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).send('Invalid email format');
    }
    // Day 36: links -- not sent means unchanged (an older app version).
    const links = parseLinks(req.body.links);
    if (links === null) return res.status(400).send(LINKS_ERROR);
    const previous = avatarUrl
      ? (await db.query('SELECT avatar_url FROM users WHERE id = $1', [req.userId])).rows[0]?.avatar_url
      : null;
    const result = await db.query(
      // Changing the email drops verification: the account hasn't proven it
      // owns the NEW address. (SET expressions see the row's old values, so
      // `email = $6` compares against the current address; $6 is the same
      // value as $2, passed separately so Postgres infers one type per param.) The user can
      // re-verify via POST /resend-verification (the in-app banner).
      `UPDATE users SET username = $1, email = $2, bio = $3, avatar_url = COALESCE($4, avatar_url),
         email_verified = CASE WHEN email = $6 THEN email_verified ELSE false END,
         links = COALESCE($7::text[], links)
       WHERE id = $5
       RETURNING id, username, email, bio, links, avatar_url, email_verified, created_at`,
      [username, email, bio || null, avatarUrl, req.userId, email, links ?? null]
    );
    // Replaced: the old picture is no longer used anywhere.
    if (previous && previous !== avatarUrl) deleteMedia([previous]);
    res.status(200).json(result.rows[0]);
  } catch (err) {
    // (A refused update's new picture is removed by the upload middleware.)
    if (err.code === '23505') {
      return res.status(400).send('Email or username already exists');
    }
    sendError(res, err, 'Update profile failed. Please try again later.');
  }
}

// Day 36: cover photo. PUT /profile/cover (multipart "cover") sets it;
// DELETE /profile/cover removes it. The replaced file is deleted.
async function replaceCover(userId, url) {
  const previous = (await db.query('SELECT cover_url FROM users WHERE id = $1', [userId])).rows[0]?.cover_url;
  await db.query('UPDATE users SET cover_url = $1 WHERE id = $2', [url, userId]);
  if (previous && previous !== url) deleteMedia([previous]);
}

async function setCover(req, res) {
  try {
    if (!req.cloudinaryResult) return res.status(400).send('Choose a photo');
    const url = req.cloudinaryResult.secure_url;
    await replaceCover(req.userId, url);
    res.json({ cover_url: url });
  } catch (err) {
    sendError(res, err, 'Updating the cover photo failed. Please try again later.');
  }
}

// Day 78: PUT /profile/avatar -- the profile photo alone (the first-run
// steps). PUT /profile saves every field at once, so a form without the
// bio would wipe it.
async function setAvatar(req, res) {
  try {
    if (!req.cloudinaryResult) return res.status(400).send('Choose a photo');
    const url = req.cloudinaryResult.secure_url;
    const previous = (await db.query('SELECT avatar_url FROM users WHERE id = $1', [req.userId])).rows[0]?.avatar_url;
    await db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, req.userId]);
    if (previous && previous !== url) deleteMedia([previous]);
    res.json({ avatar_url: url });
  } catch (err) {
    sendError(res, err, 'Updating the profile photo failed. Please try again later.');
  }
}

// Day 78: POST /profile/onboarding/done -- the first-run steps were
// finished or skipped; they aren't shown again. Repeating it keeps the
// first time.
async function finishOnboarding(req, res) {
  try {
    const result = await db.query(
      'UPDATE users SET onboarded_at = COALESCE(onboarded_at, now()) WHERE id = $1 RETURNING onboarded_at',
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).send('User not found');
    res.json({ onboarded_at: result.rows[0].onboarded_at });
  } catch (err) {
    sendError(res, err, 'Saving failed. Please try again later.');
  }
}

async function removeCover(req, res) {
  try {
    await replaceCover(req.userId, null);
    res.json({ cover_url: null });
  } catch (err) {
    sendError(res, err, 'Updating the cover photo failed. Please try again later.');
  }
}

// Day 36: PUT /profile/pinned-post { postId } pins one of your own posts to
// the top of your profile (replacing any earlier pin); DELETE unpins. Only
// a post that shows on your profile can be pinned -- not one in a group or
// posted as a page. Anything else is the same 404 as a missing post.
async function pinPost(req, res) {
  try {
    const postId = Number(req.body?.postId);
    if (!Number.isInteger(postId) || postId <= 0) return res.status(400).send('postId is required');
    const result = await db.query(
      `UPDATE users SET pinned_post_id = $2
       WHERE id = $1 AND EXISTS (
         SELECT 1 FROM posts WHERE id = $2 AND user_id = $1 AND community_id IS NULL AND page_id IS NULL
       )
       RETURNING pinned_post_id`,
      [req.userId, postId]
    );
    if (result.rows.length === 0) return res.status(404).send('Post not found');
    res.json({ pinned_post_id: postId });
  } catch (err) {
    sendError(res, err, 'Pinning the post failed. Please try again later.');
  }
}

async function unpinPost(req, res) {
  try {
    await db.query('UPDATE users SET pinned_post_id = NULL WHERE id = $1', [req.userId]);
    res.json({ pinned_post_id: null });
  } catch (err) {
    sendError(res, err, 'Unpinning the post failed. Please try again later.');
  }
}

async function updatePrivacy(req, res) {
  try {
    if (typeof req.body.isPrivate !== 'boolean') {
      return res.status(400).send('isPrivate must be true or false');
    }
    const result = await db.query(
      'UPDATE users SET is_private = $1 WHERE id = $2 RETURNING id, is_private',
      [req.body.isPrivate, req.userId]
    );
    res.status(200).json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Update privacy setting failed. Please try again later.');
  }
}

// Day 16: PUT /profile/language { language } -- the app language for this
// account, applied on every device it logs in on.
// Day 47: PUT /profile/interactions { messagePermission?, commentPermission? }
// -- who can message you / comment on your posts. Either or both.
async function updateInteractions(req, res) {
  try {
    const { messagePermission, commentPermission } = req.body || {};
    if (messagePermission === undefined && commentPermission === undefined) {
      return res.status(400).send('Nothing to update');
    }
    if (messagePermission !== undefined && !interactionService.MESSAGE_PERMISSIONS.includes(messagePermission)) {
      return res.status(400).send(`messagePermission must be one of: ${interactionService.MESSAGE_PERMISSIONS.join(', ')}`);
    }
    if (commentPermission !== undefined && !interactionService.COMMENT_PERMISSIONS.includes(commentPermission)) {
      return res.status(400).send(`commentPermission must be one of: ${interactionService.COMMENT_PERMISSIONS.join(', ')}`);
    }
    const result = await db.query(
      `UPDATE users SET message_permission = COALESCE($1, message_permission), comment_permission = COALESCE($2, comment_permission)
       WHERE id = $3 RETURNING message_permission, comment_permission`,
      [messagePermission ?? null, commentPermission ?? null, req.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Saving your settings failed. Please try again later.');
  }
}

async function updateLanguage(req, res) {
  try {
    const language = req.body?.language;
    if (!isAppLanguage(language)) {
      return res.status(400).send(`language must be one of: ${APP_LANGUAGES.join(', ')}`);
    }
    const result = await db.query('UPDATE users SET language = $1 WHERE id = $2 RETURNING language', [language, req.userId]);
    if (result.rows.length === 0) return res.status(404).send('User not found');
    res.status(200).json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Saving the language failed. Please try again later.');
  }
}

// Day 84: PUT /profile/time-zone { timeZone } -- the app reports its zone
// when it starts, so the morning memories notification comes in the
// person's own morning.
async function updateTimeZone(req, res) {
  try {
    const timeZone = textOf(req.body?.timeZone);
    if (!validZone(timeZone)) return res.status(400).send('timeZone must be a time zone name such as Europe/London');
    const result = await db.query('UPDATE users SET time_zone = $1 WHERE id = $2 RETURNING time_zone', [timeZone, req.userId]);
    if (result.rows.length === 0) return res.status(404).send('User not found');
    res.json({ timeZone: result.rows[0].time_zone });
  } catch (err) {
    sendError(res, err, 'Saving the time zone failed. Please try again later.');
  }
}

module.exports = { getMyProfile, getProfile, updateProfile, updatePrivacy, updateLanguage, updateTimeZone, exportMyData, setCover, removeCover, setAvatar, finishOnboarding, pinPost, unpinPost, updateInteractions };
