require('dotenv').config();
// Before anything else reads the environment: refuse to start with a clear
// message if required settings are missing. Only when run as the server,
// not when the test suite require()s this file.
if (require.main === module) require('./config/env').assertEnv();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db');
const allowedOrigins = require('./config/allowedOrigins');
const { resolveTrustProxy } = require('./config/trustProxy');
const { globalLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const { initSocket } = require('./sockets');

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const postRoutes = require('./routes/postRoutes');
const commentRoutes = require('./routes/commentRoutes');
const likeRoutes = require('./routes/likeRoutes');
const followRoutes = require('./routes/followRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const searchRoutes = require('./routes/searchRoutes');
const blockRoutes = require('./routes/blockRoutes');
const reportRoutes = require('./routes/reportRoutes');
const bookmarkRoutes = require('./routes/bookmarkRoutes');
const hashtagRoutes = require('./routes/hashtagRoutes');
const storyRoutes = require('./routes/storyRoutes');
const userPostsRoutes = require('./routes/userPostsRoutes');
const exploreRoutes = require('./routes/exploreRoutes');
const suggestionRoutes = require('./routes/suggestionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const communityRoutes = require('./routes/communityRoutes');
const pageRoutes = require('./routes/pageRoutes');
const configRoutes = require('./routes/configRoutes');
const sessionRoutes = require('./routes/sessionRoutes');

const app = express();
// Hosts like Render tell the app which port to listen on (validated by
// config/env.js; 0 = any free port).
const PORT = process.env.PORT?.trim() ? Number(process.env.PORT) : 3000;

// Before any middleware reads req.ip (the rate limiters): behind Render's
// proxy it must resolve to the real client, not the proxy.
app.set('trust proxy', resolveTrustProxy(process.env));

app.use(helmet({
  // Post/avatar images used to be served locally under /uploads and needed
  // to be loaded cross-origin by the frontend (a different port in dev, a
  // different domain in prod) -- helmet's default same-origin CORP would
  // have silently blocked those <img> loads. That local /uploads route is
  // gone now (all image storage moved to Cloudinary, which sets its own
  // headers), but this stays in case anything else this backend ever
  // serves directly needs the same cross-origin <img>/<script> loading.
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(express.json());
// Express 5 leaves req.body undefined when a request has no body; every
// handler here reads req.body.x or destructures it, which would then throw
// (a 500 instead of the handler's own 400). Default it to {} once, here.
// (multer sets req.body itself on multipart routes, after this runs.)
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});
app.use(cors({
  origin: (origin, callback) => {
    // No Origin header means a non-browser caller (curl, server-to-server,
    // a future mobile app) -- CORS only governs browser cross-origin fetches,
    // so those are always allowed through.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const err = new Error('Not allowed by CORS');
    err.status = 403;
    err.expose = true;
    callback(err);
  }
}));

// Applied before every route below -- each sensitive route's own stricter
// limiter (loginLimiter, signupLimiter, ...) stacks on top of this floor,
// it doesn't replace it.
app.use(globalLimiter);

app.get('/', (req, res) => {
  res.send('Hello! My social media app backend is running!');
});
app.get('/test-db', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.send('Database connected! Server time: ' + result.rows[0].now);
  } catch (err) {
    // Public endpoint: log the real error server-side, never echo DB
    // error text (hostnames, auth failures, ...) back to the caller.
    console.error('GET /test-db failed:', err.message);
    res.status(500).send('Database connection failed');
  }
});

app.use(configRoutes);
// Before followRoutes/userPostsRoutes: literal /users/suggestions must win over /users/:id/... patterns.
app.use(suggestionRoutes);
app.use(authRoutes);
app.use(sessionRoutes);
app.use(profileRoutes);
app.use(postRoutes);
app.use(commentRoutes);
app.use(likeRoutes);
app.use(followRoutes);
app.use(notificationRoutes);
app.use(conversationRoutes);
app.use(searchRoutes);
app.use(blockRoutes);
app.use(reportRoutes);
app.use(bookmarkRoutes);
app.use(hashtagRoutes);
app.use(storyRoutes);
app.use(userPostsRoutes);
app.use(exploreRoutes);
app.use(adminRoutes);
app.use(communityRoutes);
app.use(pageRoutes);

// Last: upload rejections (400), upload provider failures (502), CORS (403),
// anything unexpected (500, logged). See middleware/errorHandler.js.
app.use(errorHandler);

module.exports = app;

// Only bind a real port/socket server when this file is run directly
// (`node server.js`), not when it's require()'d as a module -- the
// automated test suite requires this file to get `app` for Supertest,
// which starts its own ephemeral server per request and must not also
// trigger a real network listener or Socket.io init.
if (require.main === module) {
  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${httpServer.address().port}`);
  });
}
