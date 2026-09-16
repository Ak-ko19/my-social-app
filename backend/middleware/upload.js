const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Client-supplied mimetype/filename are both attacker-controlled. The
// extension used on disk must come only from this allowlist -- never from
// the original filename -- otherwise an attacker can claim "image/png"
// while naming the file "x.html" and get it served back as text/html.
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
};
const ALLOWED_MIME_TYPES = Object.keys(MIME_TO_EXT);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // fileFilter (below) has already rejected anything not in MIME_TO_EXT
    // by the time this runs, so the lookup is always defined.
    const ext = MIME_TO_EXT[file.mimetype];
    const uniqueName = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, uniqueName);
  }
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, GIF, and WEBP images are allowed'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Client-supplied mimetype is just a header and can be spoofed entirely --
// this checks the actual file bytes on disk match a real image of the
// claimed type, so a non-image file lying about its Content-Type gets
// rejected and deleted rather than stored.
const MAGIC_BYTES = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]]
};

function matchesSignature(buffer, mimetype) {
  if (mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return false;
  return signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte));
}

function validateImageContent(req, res, next) {
  if (!req.file) return next();

  const buffer = Buffer.alloc(12);
  const fd = fs.openSync(req.file.path, 'r');
  fs.readSync(fd, buffer, 0, 12, 0);
  fs.closeSync(fd);

  if (!matchesSignature(buffer, req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).send('Uploaded file does not match a valid image format');
  }
  next();
}

module.exports = upload;
module.exports.validateImageContent = validateImageContent;
