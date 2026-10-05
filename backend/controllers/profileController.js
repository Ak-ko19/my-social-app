const db = require('../db');
const { APP_LANGUAGES, isAppLanguage } = require('../config/languages');
const { sendServerError } = require('../utils/sendError');
const { deleteMedia } = require('../services/mediaCleanupService');
const blockService = require('../services/blockService');
const { buildExport } = require('../services/dataExportService');

// Same check signup uses (authController.EMAIL_REGEX).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getMyProfile(req, res) {
  try {
    const result = await db.query('SELECT id, username, email, bio, avatar_url, is_private, email_verified, is_admin, language, created_at FROM users WHERE id = $1', [req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err, 'Error fetching profile. Please try again later.');
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
    sendServerError(res, err, 'Preparing your data failed. Please try again later.');
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
      SELECT id, username, bio, avatar_url, is_private, is_deactivated, created_at,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = users.id AND status = 'accepted') AS is_following,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = users.id AND status = 'pending') AS follow_request_pending,
        $1::int IS NOT NULL AND EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = users.id) AS is_blocked_by_me
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

    res.status(200).json(profile);
  } catch (err) {
    sendServerError(res, err, 'Error fetching profile. Please try again later.');
  }
}

async function updateProfile(req, res) {
  // A new avatar is already on Cloudinary by the time this runs.
  const avatarUrl = req.cloudinaryResult ? req.cloudinaryResult.secure_url : null;
  try {
    const username = (req.body.username || '').trim();
    const email = (req.body.email || '').trim();
    const { bio } = req.body;
    if (!username || !email) {
      return res.status(400).send('Username and email are required');
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).send('Invalid email format');
    }
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
         email_verified = CASE WHEN email = $6 THEN email_verified ELSE false END
       WHERE id = $5
       RETURNING id, username, email, bio, avatar_url, email_verified, created_at`,
      [username, email, bio || null, avatarUrl, req.userId, email]
    );
    // Replaced: the old picture is no longer used anywhere.
    if (previous && previous !== avatarUrl) deleteMedia([previous]);
    res.status(200).json(result.rows[0]);
  } catch (err) {
    // (A refused update's new picture is removed by the upload middleware.)
    if (err.code === '23505') {
      return res.status(400).send('Email or username already exists');
    }
    sendServerError(res, err, 'Update profile failed. Please try again later.');
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
    sendServerError(res, err, 'Update privacy setting failed. Please try again later.');
  }
}

// Day 16: PUT /profile/language { language } -- the app language for this
// account, applied on every device it logs in on.
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
    sendServerError(res, err, 'Saving the language failed. Please try again later.');
  }
}

module.exports = { getMyProfile, getProfile, updateProfile, updatePrivacy, updateLanguage, exportMyData };
