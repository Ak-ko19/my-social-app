// A tiny stand-in for Cloudinary (Day 64), so the journeys can upload real
// photos without an account. e2e-up.sh (E2E_MEDIA=1) points the backend's
// Cloudinary SDK here with CLOUDINARY_URL's upload_prefix -- the SDK's own
// setting, so the app's code is the same as in production. Uploads (the
// SDK's signed multipart POST) are kept in memory and served back from the
// returned secure_url. Started by e2e-up.sh.
//   node cloudinary-stub.cjs [port=3904] [cloud=e2ecloud]
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.argv[2] || 3904);
const CLOUD = process.argv[3] || 'e2ecloud';
const files = new Map(); // path -> { type, body }

// By the file's first bytes, like Cloudinary (not the name or the header).
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return ['jpg', 'image/jpeg'];
  if (buf.slice(0, 4).toString('latin1') === '\x89PNG') return ['png', 'image/png'];
  if (buf.slice(0, 4).toString('latin1') === 'GIF8') return ['gif', 'image/gif'];
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return ['webp', 'image/webp'];
  return null;
}

// multipart/form-data -> { field: Buffer }
function parseForm(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  if (!boundary) return {};
  const sep = Buffer.from(`--${boundary[1] || boundary[2]}`);
  const fields = {};
  let at = body.indexOf(sep);
  while (at !== -1) {
    const next = body.indexOf(sep, at + sep.length);
    if (next === -1) break;
    const part = body.slice(at + sep.length + 2, next - 2); // drop CRLFs
    const split = part.indexOf('\r\n\r\n');
    const name = /name="([^"]+)"/.exec(part.slice(0, split).toString('latin1'));
    if (name) fields[name[1]] = part.slice(split + 4);
    at = next;
  }
  return fields;
}

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const upload = new RegExp(`^/v1_1/${CLOUD}/(image|video)/upload$`).exec(req.url);
    if (req.method === 'POST' && upload) {
      const form = parseForm(Buffer.concat(chunks), req.headers['content-type']);
      // The SDK signs every upload; a request without one isn't from it.
      if (!form.file || !form.signature || !form.api_key) return json(res, 400, { error: { message: 'Missing file or signature' } });
      const kind = sniff(form.file);
      if (!kind) return json(res, 400, { error: { message: 'Invalid image file' } });
      const folder = form.folder ? `${form.folder.toString()}/` : '';
      const publicId = `${folder}${crypto.randomBytes(8).toString('hex')}`;
      const path = `/${CLOUD}/${upload[1]}/upload/v1/${publicId}.${kind[0]}`;
      files.set(path, { type: kind[1], body: form.file });
      return json(res, 200, {
        public_id: publicId, version: 1, resource_type: upload[1], format: kind[0], bytes: form.file.length,
        secure_url: `http://localhost:${PORT}${path}`, url: `http://localhost:${PORT}${path}`
      });
    }
    const file = req.method === 'GET' && files.get(req.url.split('?')[0]);
    if (file) {
      res.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.body.length, 'Access-Control-Allow-Origin': '*' });
      return res.end(file.body);
    }
    json(res, 404, { error: { message: 'Not found' } });
  });
}).listen(PORT, () => console.log(`cloudinary stub on :${PORT} (cloud ${CLOUD})`));
