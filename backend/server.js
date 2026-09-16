require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const postRoutes = require('./routes/postRoutes');
const commentRoutes = require('./routes/commentRoutes');
const likeRoutes = require('./routes/likeRoutes');
const followRoutes = require('./routes/followRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const searchRoutes = require('./routes/searchRoutes');

const app = express();
const PORT = 3000;

app.use(helmet({
  // Post/avatar images in /uploads are meant to be loaded cross-origin by
  // the frontend (a different port in dev, a different domain in prod) --
  // helmet's default same-origin CORP would silently block those <img> loads.
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(express.json());
app.use(cors({
  origin: (origin, callback) => {
    // No Origin header means a non-browser caller (curl, server-to-server,
    // a future mobile app) -- CORS only governs browser cross-origin fetches,
    // so those are always allowed through.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.send('Hello! My social media app backend is running!');
});
app.get('/test-db', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.send('Database connected! Server time: ' + result.rows[0].now);
  } catch (err) {
    res.status(500).send('Database connection failed: ' + err.message);
  }
});

app.use(authRoutes);
app.use(profileRoutes);
app.use(postRoutes);
app.use(commentRoutes);
app.use(likeRoutes);
app.use(followRoutes);
app.use(notificationRoutes);
app.use(messageRoutes);
app.use(searchRoutes);

// Handle multer upload errors (wrong file type, too large) with a clear message
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).send(err.message || 'Upload failed');
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
