-- Migration: 001_add_performance_indexes
-- Purpose: Add indexes for foreign-key / WHERE / ORDER BY columns that are
-- hit on every request but currently force sequential scans (verified via
-- EXPLAIN against the live dev DB, table sizes will only get worse in prod).
--
-- Uses CONCURRENTLY so index builds do not take a write lock on the table --
-- required for safely running this against a database with live traffic.
-- NOTE: CONCURRENTLY cannot run inside a transaction block; run each
-- statement individually (psql -f will do this automatically since none of
-- these are wrapped in BEGIN/COMMIT).

-- posts: feed filters by user_id (WHERE user_id IN (...)); public feed and
-- feed both ORDER BY created_at DESC.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_user_id ON posts (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);

-- comments: every post's comment list filters by post_id and sorts by created_at.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_post_id_created_at ON comments (post_id, created_at);

-- messages: conversation lookups filter by (sender_id, receiver_id) in both
-- directions via OR; two composite indexes cover each direction so Postgres
-- can use an index scan instead of falling back to a sequential scan + filter.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_receiver ON messages (sender_id, receiver_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_receiver_sender ON messages (receiver_id, sender_id, created_at);

-- notifications: notification feed filters by user_id and sorts by created_at;
-- unread-count is a hot, frequently-polled query -- partial index keeps it tiny.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_id_created_at ON notifications (user_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE is_read = false;

-- notifications.post_id / comment_id are ON DELETE CASCADE from posts/comments.
-- Without an index here, deleting a single post or comment forces a full
-- sequential scan of notifications to find cascade targets.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_post_id ON notifications (post_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_comment_id ON notifications (comment_id);

-- follows: the existing unique index on (follower_id, following_id) only
-- serves lookups by follower_id. getFollowers filters by following_id alone,
-- which was doing a full table scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_following_id ON follows (following_id);

-- users.reset_token: looked up on every password-reset attempt. Partial index
-- (column is NULL for the vast majority of users) keeps the index small and
-- avoids a full users table scan per reset attempt.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_reset_token ON users (reset_token) WHERE reset_token IS NOT NULL;
