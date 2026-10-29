-- Day 27: bulk data for the performance suite (day27-perf.cjs). About a
-- million rows: 30,000 users, 150k posts over a year, likes, comments, follows,
-- notifications, conversations and messages -- enough that a missing index
-- shows up as a sequential scan. alice (id 1) gets a realistic share:
-- follows and followers, notifications, conversations, bookmarks.
\set ON_ERROR_STOP on
SET client_min_messages = warning;

INSERT INTO users (username, email, password, email_verified)
SELECT 'perf' || g, 'perf' || g || '@example.test', 'x', true FROM generate_series(1, 30000) g;

CREATE TEMP TABLE r AS
SELECT (SELECT min(id) FROM users WHERE username LIKE 'perf%') AS ulo;

INSERT INTO posts (user_id, content, created_at, visibility)
SELECT r.ulo + (random() * 29999)::int, 'Perf post ' || g || ' #perf', now() - (150001 - g) * interval '210 seconds',
       CASE WHEN g % 10 = 0 THEN 'followers' ELSE 'public' END
FROM r, generate_series(1, 150000) g;

ALTER TABLE r ADD COLUMN plo int;
UPDATE r SET plo = (SELECT min(id) FROM posts WHERE content LIKE 'Perf post %');

-- 3,000 tags of about 50 posts each, like a real site; #perf on every
-- tenth post (15k: a popular tag).
INSERT INTO hashtags (tag) SELECT 't' || g FROM generate_series(0, 2999) g;
INSERT INTO post_hashtags (post_id, hashtag_id)
SELECT p.id, (SELECT id FROM hashtags WHERE LOWER(tag) = 't' || (p.id % 3000)) FROM posts p WHERE p.id >= (SELECT plo FROM r);
INSERT INTO hashtags (tag) VALUES ('perf') ON CONFLICT DO NOTHING;
INSERT INTO post_hashtags (post_id, hashtag_id)
SELECT p.id, (SELECT id FROM hashtags WHERE LOWER(tag) = 'perf') FROM posts p WHERE p.id >= (SELECT plo FROM r) AND p.id % 10 = 0;
-- A few posts about one place, for search.
UPDATE posts SET content = content || ' Shwedagon at sunset' WHERE id IN (SELECT r.plo + g * 30011 FROM r, generate_series(0, 4) g);
-- A rare tag too (5 old posts): its page must not walk every post.
INSERT INTO hashtags (tag) VALUES ('mingalar') ON CONFLICT DO NOTHING;
INSERT INTO post_hashtags (post_id, hashtag_id)
SELECT r.plo + 140000 + g, (SELECT id FROM hashtags WHERE LOWER(tag) = 'mingalar') FROM r, generate_series(0, 4) g;

INSERT INTO likes (post_id, user_id, created_at)
SELECT r.plo + (random() * 149999)::int, r.ulo + (random() * 29999)::int, now() - random() * interval '30 days'
FROM r, generate_series(1, 300000) ON CONFLICT DO NOTHING;

INSERT INTO comments (post_id, user_id, content, created_at)
SELECT r.plo + (random() * 149999)::int, r.ulo + (random() * 29999)::int, 'Perf comment ' || g, now() - g * interval '15 seconds'
FROM r, generate_series(1, 150000) g;

-- Days 109-110: one busy discussion -- the measured post (plo + 70000) gets
-- 2,000 comments, the first with 500 replies, and comment likes, so both
-- orders and the replies list are measured at size.
INSERT INTO comments (post_id, user_id, content, created_at)
SELECT r.plo + 70000, r.ulo + (g % 30000), 'Thread ' || g, now() - g * interval '1 minute'
FROM r, generate_series(1, 2000) g;
INSERT INTO comments (post_id, user_id, content, parent_comment_id, created_at)
SELECT r.plo + 70000, r.ulo + (g % 30000), 'Reply ' || g,
       (SELECT min(c.id) FROM comments c WHERE c.post_id = r.plo + 70000 AND c.content = 'Thread 1'),
       now() + g * interval '1 second'
FROM r, generate_series(1, 500) g;
INSERT INTO comment_likes (comment_id, user_id)
SELECT c.id, r.ulo + (random() * 29999)::int FROM r, comments c, generate_series(1, 3)
WHERE c.post_id = r.plo + 70000 AND c.parent_comment_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO follows (follower_id, following_id)
SELECT r.ulo + (random() * 29999)::int, r.ulo + (random() * 29999)::int FROM r, generate_series(1, 300000)
ON CONFLICT DO NOTHING;
DELETE FROM follows WHERE follower_id = following_id;
INSERT INTO follows (follower_id, following_id) SELECT 1, r.ulo + g FROM r, generate_series(0, 299) g ON CONFLICT DO NOTHING;
INSERT INTO follows (follower_id, following_id) SELECT r.ulo + g, 1 FROM r, generate_series(300, 599) g ON CONFLICT DO NOTHING;

INSERT INTO notifications (user_id, actor_id, type, post_id, created_at)
SELECT CASE WHEN g % 30 = 0 THEN 1 ELSE r.ulo + (random() * 29999)::int END, r.ulo + (random() * 29999)::int, 'like',
       r.plo + (random() * 149999)::int, now() - g * interval '30 seconds'
FROM r, generate_series(1, 100000) g;

-- Conversations: 300 with alice, 2,000 between other users; 100 messages each.
INSERT INTO conversations (type, user_a_id, user_b_id)
SELECT 'direct', 1, r.ulo + g FROM r, generate_series(0, 299) g;
INSERT INTO conversations (type, user_a_id, user_b_id)
SELECT 'direct', r.ulo + g, r.ulo + 1000 + g FROM r, generate_series(0, 1999) g;
INSERT INTO conversation_participants (conversation_id, user_id)
SELECT c.id, c.user_a_id FROM conversations c WHERE c.type = 'direct'
UNION ALL SELECT c.id, c.user_b_id FROM conversations c WHERE c.type = 'direct'
ON CONFLICT DO NOTHING;
INSERT INTO messages (conversation_id, sender_id, content, created_at)
SELECT c.id, CASE WHEN g % 2 = 0 THEN c.user_a_id ELSE c.user_b_id END, 'Perf message ' || g,
       now() - (100 - g) * interval '1 minute' - c.id * interval '1 second'
FROM conversations c, generate_series(1, 100) g
WHERE c.user_b_id >= (SELECT ulo FROM r);
-- alice has read all but the last 5 messages of each conversation.
UPDATE conversation_participants cp SET last_read_message_id = (
  SELECT m.id FROM messages m WHERE m.conversation_id = cp.conversation_id ORDER BY m.id DESC OFFSET 5 LIMIT 1)
WHERE cp.user_id = 1;

-- Days 93-94: every 20th post shares the post before it (so lists read
-- the shared post's card, and share counts, at this size too).
UPDATE posts SET shared_post_id = posts.id - 1, is_share = true
FROM r WHERE posts.id > r.plo AND posts.id % 20 = 0;

INSERT INTO bookmarks (user_id, post_id) SELECT 1, r.plo + g * 7 FROM r, generate_series(0, 199) g;
-- Days 107-108: the viewer follows 50 hashtags (their public posts come to
-- Home). Not the busy #perf (1 post in 10): measured once with it, /feed
-- read fewer rows (1336), but so dense a feed makes ?page=5 cheap too and
-- the cursor check below no longer compares walks.
INSERT INTO hashtag_follows (user_id, hashtag_id)
SELECT 1, id FROM hashtags WHERE tag IN (SELECT 't' || (g * 59) FROM generate_series(0, 49) g);
INSERT INTO stories (user_id, media_url, created_at, expires_at)
SELECT r.ulo + (g % 30000), 'https://res.cloudinary.com/demo/image/upload/sample.jpg', now() - g * interval '1 minute',
       now() - g * interval '1 minute' + interval '24 hours'
FROM r, generate_series(1, 5000) g;

-- Day 74: VACUUM too, not just ANALYZE: like a database that has been
-- running a while (autovacuum), the tables' visibility maps are set, so an
-- index-only scan doesn't read the table for every row. Without it the
-- counts depended on whether autovacuum had got there yet (e.g. Explore
-- read 11k extra likes rows in the first minute after seeding).
VACUUM ANALYZE;
