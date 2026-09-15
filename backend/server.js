require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

app.use(express.json());
app.use(cors());
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
