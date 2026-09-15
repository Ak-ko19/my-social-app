require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const app = express();
const PORT = 3000;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
app.use(express.json());
app.use(cors());

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

app.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).send('Username, email, and password are all required');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).send('Email or username already exists');
    }
    res.status(500).send('Signup failed: ' + err.message);
  }
});
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).send('Email and password are required');
    }
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(400).send('User not found');
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).send('Incorrect password');
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
res.status(200).json({ token, id: user.id, username: user.username, email: user.email });
  } catch (err) {
    res.status(500).send('Login failed: ' + err.message);
  }
});
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).send('No token provided');
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).send('Invalid or expired token');
  }
}
// Get Own Profile (for pre-filling the edit form)
app.get('/profile/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT id, username, email, bio, created_at FROM users WHERE id = $1', [req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Error fetching profile: ' + err.message);
  }
});

app.get('/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT id, username, email, bio, created_at FROM users WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Error fetching profile: ' + err.message);
  }
});

// Update Own Profile
app.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, email, bio } = req.body;
    if (!username || !email) {
      return res.status(400).send('Username and email are required');
    }
    const result = await db.query(
      'UPDATE users SET username = $1, email = $2, bio = $3 WHERE id = $4 RETURNING id, username, email, bio, created_at',
      [username, email, bio || null, req.userId]
    );
    res.status(200).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).send('Email or username already exists');
    }
    res.status(500).send('Update profile failed: ' + err.message);
  }
});
// Create Post
app.post('/posts', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).send('Post content cannot be empty');
    }
    const result = await db.query(
      'INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING *',
      [req.userId, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Create post failed: ' + err.message);
  }
});

// Get All Posts (with pagination)
app.get('/posts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT posts.id, posts.content, posts.created_at, users.id AS user_id, users.username 
      FROM posts 
      JOIN users ON posts.user_id = users.id 
      ORDER BY posts.created_at DESC 
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await db.query('SELECT COUNT(*) FROM posts');
    const totalPosts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalPosts / limit);

    res.json({
      posts: result.rows,
      currentPage: page,
      totalPages: totalPages,
      totalPosts: totalPosts
    });
  } catch (err) {
    res.status(500).send('Fetch posts failed: ' + err.message);
  }
});

app.get('/feed', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const feedQuery = `
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = $1
      )
      ORDER BY posts.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(feedQuery, [userId, limit, offset]);

    res.status(200).json({
      page: page,
      limit: limit,
      posts: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
// Get Single Post
app.get('/posts/:id', async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const result = await db.query(`
      SELECT posts.id, posts.content, posts.created_at, users.id AS user_id, users.username 
      FROM posts 
      JOIN users ON posts.user_id = users.id 
      WHERE posts.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Fetch post failed: ' + err.message);
  }
});

// Edit Post
app.put('/posts/:id', authMiddleware, async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const { content } = req.body;
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    if (postCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only edit your own posts');
    }
    const result = await db.query(
      'UPDATE posts SET content = $1 WHERE id = $2 RETURNING *',
      [content, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Update post failed: ' + err.message);
  }
});

// Delete Post
app.delete('/posts/:id', authMiddleware, async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    if (postCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only delete your own posts');
    }
    await db.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.send('Post deleted successfully');
  } catch (err) {
    res.status(500).send('Delete post failed: ' + err.message);
  }
});

// ===== COMMENT ROUTES =====

// Create Comment
app.post('/posts/:id/comments', authMiddleware, async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).send('Comment cannot be empty');
    }
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    const result = await db.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, req.userId, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Create comment failed: ' + err.message);
  }
});

// Get All Comments for a Post
app.get('/posts/:id/comments', async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const result = await db.query(`
      SELECT comments.id, comments.content, comments.created_at, users.id AS user_id, users.username
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.post_id = $1
      ORDER BY comments.created_at ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Fetch comments failed: ' + err.message);
  }
});

// Delete Comment (owner-only)
app.delete('/comments/:id', authMiddleware, async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid comment ID');
    }
    const commentCheck = await db.query('SELECT * FROM comments WHERE id = $1', [req.params.id]);
    if (commentCheck.rows.length === 0) {
      return res.status(404).send('Comment not found');
    }
    if (commentCheck.rows[0].user_id !== req.userId) {
      return res.status(403).send('You can only delete your own comments');
    }
    await db.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
    res.send('Comment deleted successfully');
  } catch (err) {
    res.status(500).send('Delete comment failed: ' + err.message);
  }
});

// ===== LIKE ROUTES =====

// Like a Post
app.post('/posts/:id/like', authMiddleware, async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const postCheck = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    const existingLike = await db.query(
      'SELECT * FROM likes WHERE post_id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (existingLike.rows.length > 0) {
      return res.status(400).send('You already liked this post');
    }
    await db.query(
      'INSERT INTO likes (post_id, user_id) VALUES ($1, $2)',
      [req.params.id, req.userId]
    );
    res.status(201).send('Post liked successfully');
  } catch (err) {
    res.status(500).send('Like post failed: ' + err.message);
  }
});

// Unlike a Post
app.delete('/posts/:id/like', authMiddleware, async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const result = await db.query(
      'DELETE FROM likes WHERE post_id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('You have not liked this post');
    }
    res.send('Post unliked successfully');
  } catch (err) {
    res.status(500).send('Unlike post failed: ' + err.message);
  }
});

// Get Like Count + Check if Current User Liked (optional query param)
app.get('/posts/:id/likes', async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid post ID');
    }
    const countResult = await db.query(
      'SELECT COUNT(*) FROM likes WHERE post_id = $1',
      [req.params.id]
    );
    res.json({ postId: req.params.id, likeCount: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).send('Fetch likes failed: ' + err.message);
  }
});

// ===== FOLLOW ROUTES =====

// Follow a User
app.post('/users/:id/follow', authMiddleware, async (req, res) => {
  try {
   if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    } 
    const followingId = parseInt(req.params.id);

    if (followingId === req.userId) {
      return res.status(400).send('You cannot follow yourself');
    }

    const userCheck = await db.query('SELECT * FROM users WHERE id = $1', [followingId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const existingFollow = await db.query(
      'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
      [req.userId, followingId]
    );
    if (existingFollow.rows.length > 0) {
      return res.status(400).send('You are already following this user');
    }

    await db.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
      [req.userId, followingId]
    );
    res.status(201).send('User followed successfully');
  } catch (err) {
    res.status(500).send('Follow failed: ' + err.message);
  }
});

// Unfollow a User
app.delete('/users/:id/follow', authMiddleware, async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const followingId = parseInt(req.params.id);
    const result = await db.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING *',
      [req.userId, followingId]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('You are not following this user');
    }
    res.send('User unfollowed successfully');
  } catch (err) {
    res.status(500).send('Unfollow failed: ' + err.message);
  }
});

// Get Followers List (who follows this user)
app.get('/users/:id/followers', async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const result = await db.query(`
      SELECT users.id, users.username, users.email
      FROM follows
      JOIN users ON follows.follower_id = users.id
      WHERE follows.following_id = $1
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Fetch followers failed: ' + err.message);
  }
});

// Get Following List (who this user follows)
app.get('/users/:id/following', async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const result = await db.query(`
      SELECT users.id, users.username, users.email
      FROM follows
      JOIN users ON follows.following_id = users.id
      WHERE follows.follower_id = $1
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Fetch following failed: ' + err.message);
  }
});

// Get Follow Counts (followers count + following count)
app.get('/users/:id/follow-counts', async (req, res) => {
  try {
    if (isNaN(req.params.id)) {
      return res.status(400).send('Invalid user ID');
    }
    const followersResult = await db.query(
      'SELECT COUNT(*) FROM follows WHERE following_id = $1',
      [req.params.id]
    );
    const followingResult = await db.query(
      'SELECT COUNT(*) FROM follows WHERE follower_id = $1',
      [req.params.id]
    );
    res.json({
      userId: req.params.id,
      followersCount: parseInt(followersResult.rows[0].count),
      followingCount: parseInt(followingResult.rows[0].count)
    });
  } catch (err) {
    res.status(500).send('Fetch follow counts failed: ' + err.message);
  }
});
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});