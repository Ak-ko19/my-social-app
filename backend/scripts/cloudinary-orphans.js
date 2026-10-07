// Finds (and, with --delete, removes) Cloudinary files that nothing in the
// database uses any more: leftovers from before media cleanup existed, from
// a Cloudinary outage during a delete, or from a server error mid-upload.
//
//   npm run cloudinary:orphans                    # dry run: report only
//   npm run cloudinary:orphans -- --delete        # delete the orphans
//   options: --min-age-hours=24  --force
//
// Needs DATABASE_URL and the CLOUDINARY_* settings of the environment to
// check (run it where the production .env is loaded to clean production).
//
// Safety:
// - Only the app's own upload folders are listed; anything else on the
//   same Cloudinary account is never touched.
// - Files newer than --min-age-hours (default 24) are skipped: an upload in
//   progress (file stored, database row not written yet) must never look
//   orphaned.
// - --delete refuses, unless --force is given too, when the database has
//   no media at all while Cloudinary does (probably the wrong
//   DATABASE_URL), or when more than half of the files would be deleted.
require('dotenv').config();
const { cloudinaryAsset, deleteAssets } = require('../services/mediaCleanupService');

// Every folder the upload middleware writes to (see routes/*):
// 'mysocialapp' is uploadToCloudinary's default.
// Every folder the routes upload into (a test keeps this list complete).
const APP_FOLDERS = ['posts', 'avatars', 'stories', 'message-images', 'voice-messages', 'group-photos', 'covers', 'mysocialapp'];
const RESOURCE_TYPES = ['image', 'video']; // voice notes are Cloudinary 'video'
const MAX_DELETE_SHARE = 0.5;

function parseArgs(argv) {
  const opts = { delete: false, force: false, minAgeHours: 24 };
  for (const arg of argv) {
    if (arg === '--delete') opts.delete = true;
    else if (arg === '--force') opts.force = true;
    else if (arg.startsWith('--min-age-hours=')) {
      const value = arg.slice('--min-age-hours='.length);
      if (!/^\d+$/.test(value)) throw new Error('--min-age-hours must be a whole number of hours');
      opts.minAgeHours = Number(value);
    } else {
      throw new Error(`Unknown option ${arg}. Use --delete, --force, --min-age-hours=N.`);
    }
  }
  return opts;
}

const keyOf = (a) => `${a.resourceType}:${a.publicId}`;

// Every upload in the app's folders: [{ publicId, resourceType, createdAt, bytes }].
async function listAssets(api) {
  const assets = [];
  for (const resourceType of RESOURCE_TYPES) {
    for (const folder of APP_FOLDERS) {
      let cursor;
      do {
        const page = await api.resources({
          type: 'upload', resource_type: resourceType, prefix: `${folder}/`, max_results: 500, next_cursor: cursor
        });
        for (const r of page.resources || []) {
          assets.push({ publicId: r.public_id, resourceType, createdAt: new Date(r.created_at), bytes: r.bytes || 0 });
        }
        cursor = page.next_cursor;
      } while (cursor);
    }
  }
  return assets;
}

// Keys of every file the database still uses. Soft-deleted messages don't
// count (their media should be gone); expired stories do until the cleanup
// job removes their rows.
async function referencedKeys(db, cloud) {
  const result = await db.query(`
    SELECT avatar_url AS url FROM users WHERE avatar_url IS NOT NULL
    UNION SELECT cover_url FROM users WHERE cover_url IS NOT NULL
    UNION SELECT image_url FROM posts WHERE image_url IS NOT NULL
    UNION SELECT url FROM post_media
    UNION SELECT media_url FROM stories
    UNION SELECT media_url FROM messages WHERE media_url IS NOT NULL AND deleted_at IS NULL
    UNION SELECT avatar_url FROM conversations WHERE avatar_url IS NOT NULL
    UNION SELECT unnest(media_urls) FROM post_drafts
  `);
  const keys = new Set();
  for (const { url } of result.rows) {
    const asset = cloudinaryAsset(url, cloud);
    if (asset) keys.add(keyOf(asset));
  }
  return keys;
}

function findOrphans({ assets, referenced, now, minAgeHours }) {
  const cutoff = now.getTime() - minAgeHours * 3600 * 1000;
  return assets.filter((a) => !referenced.has(keyOf(a)) && a.createdAt.getTime() < cutoff);
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Returns the process exit code. Everything it talks to is passed in, so
// the tests can run it against the test database and a fake Admin API.
async function run({ argv, api, db, cloud, now = new Date(), log = console.log }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    log(err.message);
    return 2;
  }
  if (!cloud) {
    log('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).');
    return 2;
  }

  const [assets, referenced] = await Promise.all([listAssets(api), referencedKeys(db, cloud)]);
  const orphans = findOrphans({ assets, referenced, now, minAgeHours: opts.minAgeHours });
  const tooNew = assets.filter((a) => !referenced.has(keyOf(a))).length - orphans.length;

  log(`Cloudinary files in the app's folders: ${assets.length} (${mb(assets.reduce((s, a) => s + a.bytes, 0))})`);
  log(`Files the database uses: ${referenced.size}`);
  log(`Orphans older than ${opts.minAgeHours} h: ${orphans.length} (${mb(orphans.reduce((s, a) => s + a.bytes, 0))})`
    + (tooNew > 0 ? `; ${tooNew} newer unused file(s) skipped` : ''));
  for (const o of orphans.slice(0, 20)) log(`  ${o.resourceType}  ${o.publicId}`);
  if (orphans.length > 20) log(`  ... and ${orphans.length - 20} more`);

  if (!opts.delete) {
    log(orphans.length > 0 ? 'Dry run: nothing deleted. Run again with --delete to remove them.' : 'Nothing to clean up.');
    return 0;
  }
  if (orphans.length === 0) {
    log('Nothing to delete.');
    return 0;
  }
  if (!opts.force) {
    if (referenced.size === 0 && assets.length > 0) {
      log('Refusing to delete: the database uses no media at all, but Cloudinary has files. Is DATABASE_URL the right database? Add --force if this is really intended.');
      return 1;
    }
    if (orphans.length > assets.length * MAX_DELETE_SHARE) {
      log(`Refusing to delete ${orphans.length} of ${assets.length} files (more than half). Check DATABASE_URL, then add --force if this is really intended.`);
      return 1;
    }
  }
  const { deleted, failed } = await deleteAssets(orphans, api);
  log(`Deleted ${deleted} file(s)${failed ? `; ${failed} failed (see errors above; run again to retry)` : ''}.`);
  return failed ? 1 : 0;
}

module.exports = { run, parseArgs, findOrphans, listAssets, referencedKeys, APP_FOLDERS };

if (require.main === module) {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(2);
  }
  const db = require('../db');
  const cloudinary = require('../config/cloudinary');
  const cloud = CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET ? CLOUDINARY_CLOUD_NAME : null;
  run({ argv: process.argv.slice(2), api: cloudinary.api, db, cloud })
    .then((code) => { process.exitCode = code; })
    .catch((err) => { console.error('Orphan scan failed:', err.message || err); process.exitCode = 1; })
    .finally(() => db.end());
}
