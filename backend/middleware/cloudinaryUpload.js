const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_AUDIO_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'];

function imageFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, GIF, and WEBP images are allowed'));
  }
  cb(null, true);
}

function audioFileFilter(req, file, cb) {
  if (!ALLOWED_AUDIO_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Only WEBM, MP4, OGG, and MPEG audio files are allowed'));
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
function uploadToCloudinary(folder = 'mysocialapp', resourceType = 'image', format) {
  return (req, res, next) => {
    if (!req.file) return next();

    const uploadOptions = { folder, resource_type: resourceType };
    if (format) uploadOptions.format = format;

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
      if (err) return next(err);
      req.cloudinaryResult = result;
      next();
    });
    stream.end(req.file.buffer);
  };
}

module.exports = { upload, uploadAudio, uploadToCloudinary };
