require('dotenv').config();
// Before anything else reads the environment: refuse to start with a clear
// message if required settings are missing. Only when run as the server,
// not when the test suite require()s this file.
if (require.main === module) require('./config/env').assertEnv();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const allowedOrigins = require('./config/allowedOrigins');
const { resolveTrustProxy } = require('./config/trustProxy');
const { globalLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const { report, startMonitoring, whenIdle } = require('./services/errorLogService');
const requestLogger = require('./middleware/requestLogger');
const healthRoutes = require('./routes/healthRoutes');
const logger = require('./utils/logger');
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
const internalRoutes = require('./routes/internalRoutes');
const clientErrorRoutes = require('./routes/clientErrorRoutes');
const linkPreviewRoutes = require('./routes/linkPreviewRoutes');
const shareRoutes = require('./routes/shareRoutes');
const pushRoutes = require('./routes/pushRoutes');
const draftRoutes = require('./routes/draftRoutes');
const collectionRoutes = require('./routes/collectionRoutes');

const app = express();
// Hosts like Render tell the app which port to listen on (validated by
// config/env.js; 0 = any free port).
const PORT = process.env.PORT?.trim() ? Number(process.env.PORT) : 3000;

// Before any middleware reads req.ip (the rate limiters): behind Render's
// proxy it must resolve to the real client, not the proxy.
app.set('trust proxy', resolveTrustProxy(process.env));

// Day 10: one structured log line per request (not under the test suite,
// where hundreds of requests would bury the output).
if (process.env.NODE_ENV !== 'test') app.use(requestLogger);

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
// Day 10: GET /health (app + database) replaces the old GET /test-db.
app.use(healthRoutes);
app.use(configRoutes);
app.use(internalRoutes);
app.use(clientErrorRoutes);
app.use(linkPreviewRoutes);
app.use(shareRoutes);
app.use(pushRoutes);
// Before followRoutes/userPostsRoutes: literal /users/suggestions must win over /users/:id/... patterns.
app.use(suggestionRoutes);
app.use(authRoutes);
app.use(sessionRoutes);
app.use(profileRoutes);
app.use(postRoutes);
app.use(draftRoutes);
app.use(commentRoutes);
app.use(likeRoutes);
app.use(followRoutes);
app.use(notificationRoutes);
app.use(conversationRoutes);
app.use(searchRoutes);
app.use(blockRoutes);
app.use(reportRoutes);
app.use(bookmarkRoutes);
app.use(collectionRoutes);
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
  // Day 10: errors outside any request end up in the error log too.
  startMonitoring();
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled promise rejection', { err: reason });
    report(reason, { source: 'process', route: 'unhandledRejection' });
  });
  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', { err });
    report(err, { source: 'process', route: 'uncaughtException' });
    // The process is in an unknown state: exit (Render restarts a clean
    // one) as soon as the report is saved -- at most 2 s later.
    Promise.race([whenIdle(), new Promise((resolve) => setTimeout(resolve, 2000))]).finally(() => process.exit(1));
  });

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    logger.info('server started', { port: httpServer.address().port });
    // Day 45: scheduled posts and "poll ended" notifications within ~30 s
    // of their time (and whatever fell due while the server slept, at once).
    require('./services/ticker').start();
  });
}
