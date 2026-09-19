// Single source of truth for allowed CORS origins, shared by the Express
// REST API (server.js) and the Socket.io server (sockets/index.js) so the
// two never drift apart.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

module.exports = allowedOrigins;
