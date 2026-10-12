const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { clientError, uploadFailed } = require('./errorHandler');
const { deleteMedia } = require('../services/mediaCleanupService');
const uploadQuota = require('../services/uploadQuotaService');

// Files are uploaded before the route handler runs, so a request the
// handler then refuses (4xx: validation, not a member, blocked, ...) would
// leave them on Cloudinary, unused. Delete them when that happens. Not on
// 5xx: a server error can come after the row was saved, and deleting then
// would break it; the orphan scan (which checks the database) covers those.
function deleteIfRefused(res, urls) {
  res.on('finish', () => {
    if (res.statusCode >= 400 && res.statusCode < 500) deleteMedia(urls);
  });
}

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_AUDIO_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'];

function imageFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return cb(clientError('Only JPEG, PNG, GIF, and WEBP images are allowed'));
  }
  cb(null, true);
}

function audioFileFilter(req, file, cb) {
  if (!ALLOWED_AUDIO_MIME_TYPES.includes(file.mimetype)) {
    return cb(clientError('Only WEBM, MP4, OGG, and MPEG audio files are allowed'));
  }
  cb(null, true);
}

// Buffers the file in memory instead of writing to disk, since it's just
// being relayed to Cloudinary next.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Same memory-buffered approach as `upload`, separate multer instance
// because the allowed MIME types and size ceiling are voice-message-specific
// (5MB is roughly ~2 minutes of compressed voice audio, not tuned for
// images). Rejects a wrong-type/oversized file here, before it ever reaches
// Cloudinary -- fileFilter/limits errors are passed to next(err) by multer
// and land in server.js's shared upload-error handler, same as the image
// path below.
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  fileFilter: audioFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Use after upload.single('<field>')/uploadAudio.single('<field>'). Streams
// req.file.buffer to Cloudinary and attaches the response as
// req.cloudinaryResult (.secure_url, .public_id, .duration for audio/video,
// etc.) for the next handler to read. No-ops if no file was sent, so it's
// safe to chain onto routes where the upload is optional.
// resourceType is 'image' by default (existing post/avatar callers);
// voice messages pass 'video', which is Cloudinary's resource_type for
// audio files too -- Cloudinary has no separate 'audio' type.
//
// format (optional) forces Cloudinary to TRANSCODE the upload to that
// format, rather than storing/serving it in whatever container it arrived
// in -- without this, a Chrome recording (audio/webm, opus) gets served
// back at a .webm URL, which Safari's <audio> element cannot play at all
// (no WebM/Opus decode support), and a Safari recording (audio/mp4) served
// as-is is fine for Safari/Chrome but not guaranteed everywhere either.
// Voice messages pass format: 'mp3' (see conversationRoutes.js) so every
// client, regardless of which browser recorded the original file, always
// gets back a URL in one universally-playable format.
// Day 57: the person's daily upload budget is checked first (nothing is
// sent to Cloudinary when it's used up) and each stored file is recorded.
const ledgerKind = (resourceType) => (resourceType === 'video' ? 'audio' : 'image');
const storedSize = (result, file) => ({ bytes: Number.isFinite(result?.bytes) ? result.bytes : file.size });

function uploadToCloudinary(folder = 'mysocialapp', resourceType = 'image', format) {
  return async (req, res, next) => {
    if (!req.file) return next();
    try {
      await uploadQuota.checkQuota(req.userId, [req.file]);
    } catch (err) {
      return next(err);
    }

    const uploadOptions = { folder, resource_type: resourceType };
    if (format) uploadOptions.format = format;

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
      if (err) return next(uploadFailed(err));
      req.cloudinaryResult = result;
      deleteIfRefused(res, [result.secure_url]);
      uploadQuota.record(req.userId, ledgerKind(resourceType), [storedSize(result, req.file)]).then(() => next(), next);
    });
    stream.end(req.file.buffer);
  };
}

// B2: up to MAX_POST_IMAGES images per post, sent as repeated `images`
// fields. The legacy single `image` field is still accepted, so an older
// frontend (or any existing client) keeps working unchanged.
const MAX_POST_IMAGES = 10;
const TOO_MANY_IMAGES = `You can attach up to ${MAX_POST_IMAGES} images`;

function uploadPostImages(req, res, next) {
  upload.fields([
    { name: 'images', maxCount: MAX_POST_IMAGES },
    { name: 'image', maxCount: 1 }
  ])(req, res, (err) => {
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
      // multer's own message here is just "Unexpected field".
      return next(clientError(TOO_MANY_IMAGES));
    }
    if (err) return next(err);
    const files = [...(req.files?.images || []), ...(req.files?.image || [])];
    if (files.length > MAX_POST_IMAGES) {
      return next(clientError(TOO_MANY_IMAGES));
    }
    req.postImageFiles = files;
    next();
  });
}

function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => (err ? reject(err) : resolve(result)));
    stream.end(buffer);
  });
}

// Use after uploadPostImages. Uploads every file in parallel and attaches
// the results IN THE ORDER THE FILES WERE SENT as req.cloudinaryResults
// (empty array when no images). If any upload fails the request fails, and
// the images that did finish uploading are deleted again.
function uploadManyToCloudinary(folder = 'mysocialapp') {
  return async (req, res, next) => {
    const files = req.postImageFiles || [];
    try {
      await uploadQuota.checkQuota(req.userId, files);
    } catch (err) {
      return next(err);
    }
    const settled = await Promise.allSettled(
      files.map((file) => uploadBufferToCloudinary(file.buffer, { folder, resource_type: 'image' }))
    );
    const failed = settled.find((s) => s.status === 'rejected');
    if (failed) {
      deleteMedia(settled.filter((s) => s.status === 'fulfilled').map((s) => s.value.secure_url));
      return next(uploadFailed(failed.reason));
    }
    req.cloudinaryResults = settled.map((s) => s.value);
    deleteIfRefused(res, req.cloudinaryResults.map((r) => r.secure_url));
    try {
      await uploadQuota.record(req.userId, 'image', req.cloudinaryResults.map((r, i) => storedSize(r, files[i])));
    } catch (err) {
      return next(err);
    }
    next();
  };
}

module.exports = { upload, uploadAudio, uploadToCloudinary, uploadPostImages, uploadManyToCloudinary, MAX_POST_IMAGES };
