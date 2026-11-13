-- Day 27: bulk data for the performance suite (day27-perf.cjs). About 1.6
-- million rows: 150,000 users (30,000 active), 200k posts over a year,
-- likes, comments, follows, notifications, conversations and messages,
-- groups, pages, events and reports (Day 113) -- enough that a missing
-- index shows up as a sequential scan. alice (id 1) gets a realistic share:
-- follows and followers, notifications, conversations, bookmarks.
\set ON_ERROR_STOP on
SET client_min_messages = warning;

INSERT INTO users (username, email, password, email_verified)
SELECT 'perf' || g, 'perf' || g || '@example.test', 'x', true FROM generate_series(1, 30000) g;

CREATE TEMP TABLE r AS
SELECT (SELECT min(id) FROM users WHERE username LIKE 'perf%') AS ulo;

-- Day 113: most accounts on a real site are quiet -- they signed up and
-- read. 120k of them (150k users in all) make users a big table for real
-- (about 2,600 pages), so a join that reads every account is caught like
-- any other full scan. They post, follow and like nothing.
INSERT INTO users (username, email, password, email_verified)
SELECT 'quiet' || g, 'quiet' || g || '@example.test', 'x', true FROM generate_series(1, 120000) g;

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

-- Day 113: groups, pages and events at size (they had no rows here).
-- 3,000 groups (1 in 5 private) of about 50 members; the first one is busy:
-- 20,000 members and 1 in 10 of the 30k group posts. alice is in 30.
INSERT INTO communities (name, privacy, created_by)
SELECT 'Perf group ' || g, CASE WHEN g % 5 = 0 THEN 'private' ELSE 'public' END, r.ulo + (g % 30000)
FROM r, generate_series(1, 3000) g;
ALTER TABLE r ADD COLUMN glo int;
UPDATE r SET glo = (SELECT min(id) FROM communities WHERE name LIKE 'Perf group %');
INSERT INTO community_members (community_id, user_id, role)
SELECT id, created_by, 'admin' FROM communities WHERE name LIKE 'Perf group %';
INSERT INTO community_members (community_id, user_id)
SELECT r.glo + (random() * 2999)::int, r.ulo + (random() * 29999)::int FROM r, generate_series(1, 150000)
ON CONFLICT DO NOTHING;
INSERT INTO community_members (community_id, user_id) SELECT r.glo, r.ulo + g FROM r, generate_series(0, 19999) g ON CONFLICT DO NOTHING;
INSERT INTO community_members (community_id, user_id) SELECT r.glo + g * 97, 1 FROM r, generate_series(0, 29) g ON CONFLICT DO NOTHING;
INSERT INTO posts (user_id, community_id, content, created_at, visibility)
SELECT r.ulo + (random() * 29999)::int, CASE WHEN g % 10 = 0 THEN r.glo ELSE r.glo + (g % 3000) END,
       'Group post ' || g, now() - (30001 - g) * interval '1050 seconds', 'public'
FROM r, generate_series(1, 30000) g;

-- 2,000 pages, ten posts each, about 75 followers; the first is busy (20k
-- followers). alice follows 50. 300 wait for verification, 1,000 were
-- decided (every other one approved, so they show the tick).
INSERT INTO pages (name, owner_id) SELECT 'Perf page ' || g, r.ulo + (g % 30000) FROM r, generate_series(1, 2000) g;
ALTER TABLE r ADD COLUMN pglo int;
UPDATE r SET pglo = (SELECT min(id) FROM pages WHERE name LIKE 'Perf page %');
INSERT INTO page_admins (page_id, user_id) SELECT id, owner_id FROM pages WHERE name LIKE 'Perf page %';
INSERT INTO page_follows (page_id, user_id)
SELECT r.pglo + (random() * 1999)::int, r.ulo + (random() * 29999)::int FROM r, generate_series(1, 150000)
ON CONFLICT DO NOTHING;
INSERT INTO page_follows (page_id, user_id) SELECT r.pglo, r.ulo + g FROM r, generate_series(0, 19999) g ON CONFLICT DO NOTHING;
INSERT INTO page_follows (page_id, user_id) SELECT r.pglo + g * 37, 1 FROM r, generate_series(0, 49) g ON CONFLICT DO NOTHING;
INSERT INTO posts (user_id, page_id, content, created_at, visibility)
SELECT p.owner_id, p.id, 'Page post ' || g, now() - (p.id % 1000) * interval '1 hour' - g * interval '1 day', 'public'
FROM pages p, generate_series(1, 10) g WHERE p.name LIKE 'Perf page %';
INSERT INTO page_verification_requests (page_id, requested_by, note, created_at)
SELECT r.pglo + 100 + g, r.ulo + ((100 + g) % 30000), 'Perf verification ' || g, now() - g * interval '1 hour'
FROM r, generate_series(0, 299) g;
INSERT INTO page_verification_requests (page_id, requested_by, note, status, decided_by, decided_at, decline_reason, created_at)
SELECT r.pglo + 500 + g, r.ulo + ((500 + g) % 30000), 'Perf decided ' || g,
       CASE WHEN g % 2 = 0 THEN 'approved' ELSE 'declined' END, 1, now() - g * interval '1 hour',
       CASE WHEN g % 2 = 0 THEN NULL ELSE 'incomplete' END, now() - g * interval '1 hour' - interval '1 day'
FROM r, generate_series(0, 999) g;
UPDATE pages SET verified_at = now() - interval '1 day'
WHERE id IN (SELECT page_id FROM page_verification_requests WHERE status = 'approved');

-- 5,000 events from 50 days ago to 50 days ahead, about 10 answers each;
-- alice is going to 20.
INSERT INTO events (host_id, name, starts_at, audience)
SELECT r.ulo + (g % 30000), 'Perf event ' || g, now() + (g - 2500) * interval '29 minutes',
       CASE WHEN g % 10 = 0 THEN 'followers' ELSE 'public' END
FROM r, generate_series(1, 5000) g;
INSERT INTO event_responses (event_id, user_id, status)
SELECT e.id, r.ulo + (random() * 29999)::int, CASE WHEN random() < 0.5 THEN 'going' ELSE 'interested' END
FROM r, events e, generate_series(1, 10) WHERE e.name LIKE 'Perf event %'
ON CONFLICT DO NOTHING;
INSERT INTO event_responses (event_id, user_id, status)
SELECT id, 1, 'going' FROM events WHERE name LIKE 'Perf event %' AND starts_at > now() ORDER BY id LIMIT 20
ON CONFLICT DO NOTHING;

-- Reports: 20,000 handled over the year, 2,000 waiting.
INSERT INTO reports (reporter_id, target_type, target_id, reason, status, resolved_by, resolved_at, resolution, created_at)
SELECT r.ulo + (random() * 29999)::int, 'post', r.plo + (random() * 149999)::int, 'spam',
       CASE WHEN g <= 2000 THEN 'pending' ELSE 'reviewed' END::report_status,
       CASE WHEN g <= 2000 THEN NULL ELSE 1 END, CASE WHEN g <= 2000 THEN NULL ELSE now() - g * interval '20 minutes' END,
       CASE WHEN g <= 2000 THEN NULL ELSE 'dismissed' END, now() - g * interval '20 minutes' - interval '1 hour'
FROM r, generate_series(1, 22000) g;

-- Days 97-98: alice has archived 50 of her chats.
UPDATE conversation_participants SET archived_at = now() - interval '1 day'
WHERE user_id = 1 AND conversation_id IN (
  SELECT conversation_id FROM conversation_participants WHERE user_id = 1 ORDER BY conversation_id LIMIT 50);

-- Day 74: VACUUM too, not just ANALYZE: like a database that has been
-- running a while (autovacuum), the tables' visibility maps are set, so an
-- index-only scan doesn't read the table for every row. Without it the
-- counts depended on whether autovacuum had got there yet (e.g. Explore
-- read 11k extra likes rows in the first minute after seeding).
VACUUM ANALYZE;
