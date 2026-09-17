const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, GIF, and WEBP images are allowed'));
  }
  cb(null, true);
}

// Buffers the file in memory instead of writing to disk, since it's just
// being relayed to Cloudinary next.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Use after upload.single('<field>'). Streams req.file.buffer to Cloudinary
// and attaches the response as req.cloudinaryResult (.secure_url, .public_id,
// etc.) for the next handler to read. No-ops if no file was sent, so it's
// safe to chain onto routes where the image is optional.
function uploadToCloudinary(folder = 'mysocialapp') {
  return (req, res, next) => {
    if (!req.file) return next();

    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) return next(err);
        req.cloudinaryResult = result;
        next();
      }
    );
    stream.end(req.file.buffer);
  };
}

module.exports = { upload, uploadToCloudinary };
