-- Test-database schema for the automated API suite.
--
-- This is NOT a migration -- it's a structural snapshot, introspected
-- read-only from the real database's information_schema/pg_catalog on
-- 2026-09-24 (never modified, never written to), used only to seed an
-- in-memory pg-mem instance for tests. If you add/change a real migration
-- under backend/migrations/, this file needs the same change made by hand
-- (there's no single "create from scratch" migration to replay instead --
-- the original base tables predate migration tracking, see ROADMAP.md A1
-- notes) -- that's the trade-off of this approach, spelled out there.
--
-- Table order matters here (FK dependencies must be created first).

CREATE TYPE conversation_type AS ENUM ('direct', 'group');
CREATE TYPE follow_status AS ENUM ('accepted', 'pending');
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read');
-- 'image' added by migration 021_add_message_image_type (B9).
CREATE TYPE message_type AS ENUM ('text', 'voice', 'image');
CREATE TYPE report_status AS ENUM ('pending', 'reviewed');
CREATE TYPE report_target_type AS ENUM ('post', 'user', 'comment', 'message', 'community', 'page');

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username varchar(50) NOT NULL UNIQUE,
  email varchar(100) NOT NULL UNIQUE,
  password varchar(255) NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  bio text,
  reset_token text,
  reset_token_expiry timestamp,
  avatar_url text,
  last_seen timestamptz,
  is_private boolean DEFAULT false NOT NULL,
  is_deactivated boolean DEFAULT false NOT NULL,
  -- Added by migration 025_add_admin_moderation (B12).
  is_admin boolean DEFAULT false NOT NULL,
  banned_at timestamptz,
  ban_reason text,
  deactivated_at timestamptz,
  email_verified boolean DEFAULT false NOT NULL,
  verification_token text,
  verification_token_expiry timestamptz,
  -- Added by migration 028_add_sessions (Day 8).
  tokens_valid_after timestamptz,
  -- Added by migration 032_add_suspensions (Day 12): NULL = permanent ban.
  banned_until timestamptz,
  -- Added by migration 033_add_user_language (Day 16): NULL = never chosen.
  -- Migration 051: English and Arabic only (Myanmar dropped 2026-10-07).
  language varchar(5) CONSTRAINT chk_users_language CHECK (language IN ('en', 'ar'))
);
CREATE INDEX idx_users_banned_until ON users (banned_until) WHERE banned_until IS NOT NULL;

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  image_url text,
  -- Added by migration 020_add_post_visibility (B5).
  visibility varchar(10) DEFAULT 'public' NOT NULL
    -- 'only_me' added by migration 035_add_only_me_visibility (Day 20).
    CONSTRAINT chk_posts_visibility CHECK (visibility IN ('public', 'followers', 'only_me'))
);

-- Added by migration 026_add_communities (B13).
CREATE TABLE communities (
  id SERIAL PRIMARY KEY,
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  privacy varchar(10) NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'private')),
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community_members (
  community_id integer NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status varchar(10) NOT NULL DEFAULT 'member' CHECK (status IN ('member', 'pending')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

ALTER TABLE posts ADD COLUMN community_id integer REFERENCES communities(id) ON DELETE CASCADE;
CREATE INDEX idx_posts_community_created ON posts (community_id, created_at DESC) WHERE community_id IS NOT NULL;
CREATE INDEX idx_community_members_user ON community_members (user_id);

-- B14 (migration 027): pages.
CREATE TABLE pages (
  id serial PRIMARY KEY,
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  category varchar(20) NOT NULL DEFAULT 'business'
    CHECK (category IN ('business', 'creator', 'brand', 'organization', 'community', 'other')),
  description text,
  owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pages_owner ON pages (owner_id);

CREATE TABLE page_follows (
  page_id integer NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);
CREATE INDEX idx_page_follows_user ON page_follows (user_id);

ALTER TABLE posts ADD COLUMN page_id integer REFERENCES pages(id) ON DELETE CASCADE;
CREATE INDEX idx_posts_page_created ON posts (page_id, created_at DESC) WHERE page_id IS NOT NULL;
ALTER TABLE posts ADD CONSTRAINT posts_group_or_page CHECK (community_id IS NULL OR page_id IS NULL);

CREATE TABLE hashtags (
  id SERIAL PRIMARY KEY,
  tag varchar(100) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX idx_hashtags_tag_lower ON hashtags (LOWER(tag));

CREATE TABLE post_hashtags (
  post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id integer NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  type conversation_type DEFAULT 'direct'::conversation_type NOT NULL,
  user_a_id integer REFERENCES users(id) ON DELETE CASCADE,
  user_b_id integer REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  -- Added by migration 023_add_group_chats (B10).
  name varchar(100),
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_conversations_group_name CHECK (type <> 'group' OR (name IS NOT NULL AND length(btrim(name)) > 0)),
  CONSTRAINT chk_conversations_direct_pair_order CHECK (
    type <> 'direct'
    OR (user_a_id IS NOT NULL AND user_b_id IS NOT NULL AND user_a_id < user_b_id)
  )
);

-- Not a table constraint (information_schema.table_constraints won't show
-- it) -- caught by grepping migrations/ for CREATE UNIQUE INDEX after a
-- test failure surfaced the first missed one. See A1 notes in ROADMAP.md.
CREATE UNIQUE INDEX idx_conversations_direct_unique_pair
  ON conversations (user_a_id, user_b_id)
  WHERE type = 'direct';

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  conversation_id integer NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text,
  status message_status DEFAULT 'sent'::message_status NOT NULL,
  client_temp_id varchar(255),
  created_at timestamptz DEFAULT now() NOT NULL,
  edited_at timestamptz,
  deleted_at timestamptz,
  type message_type DEFAULT 'text'::message_type NOT NULL,
  media_url text,
  duration_seconds integer,
  -- Added by migration 022_add_message_replies_images (B9).
  reply_to_message_id integer REFERENCES messages(id) ON DELETE SET NULL,
  CONSTRAINT chk_messages_type_fields CHECK (
    (type = 'text' AND content IS NOT NULL AND content <> '')
    OR
    (type = 'voice' AND media_url IS NOT NULL AND duration_seconds IS NOT NULL)
    OR
    (type = 'image' AND media_url IS NOT NULL)
  )
);

CREATE TABLE conversation_participants (
  conversation_id integer NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now() NOT NULL,
  last_read_message_id integer REFERENCES messages(id) ON DELETE SET NULL,
  -- Added by migration 023_add_group_chats (B10).
  role varchar(10) DEFAULT 'member' NOT NULL CONSTRAINT chk_participants_role CHECK (role IN ('admin', 'member')),
  -- Added by migration 037 (Day 23): NULL = not muted, 'infinity' = until unmuted.
  muted_until timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id integer REFERENCES posts(id) ON DELETE CASCADE,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  -- Added by migration 019_add_comment_replies_likes (B4).
  parent_comment_id integer REFERENCES comments(id) ON DELETE CASCADE
);

-- Added by migration 019_add_comment_replies_likes (B4).
CREATE TABLE comment_likes (
  comment_id integer NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- Added by migration 018_add_stories (B3).
CREATE TABLE stories (
  id SERIAL PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

CREATE TABLE story_views (
  story_id integer NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

-- Added by migration 017_add_post_media (B2).
CREATE TABLE post_media (
  id SERIAL PRIMARY KEY,
  post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url text NOT NULL,
  position smallint NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, position)
);

CREATE TABLE likes (
  id SERIAL PRIMARY KEY,
  post_id integer REFERENCES posts(id) ON DELETE CASCADE,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  -- Added by migration 016_add_reactions (B1).
  reaction varchar(10) DEFAULT 'like' NOT NULL
    CONSTRAINT chk_likes_reaction CHECK (reaction IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
  UNIQUE (post_id, user_id)
);

CREATE TABLE follows (
  id SERIAL PRIMARY KEY,
  follower_id integer REFERENCES users(id) ON DELETE CASCADE,
  following_id integer REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  status follow_status DEFAULT 'accepted'::follow_status NOT NULL,
  UNIQUE (follower_id, following_id)
);

CREATE TABLE blocks (
  id SERIAL PRIMARY KEY,
  blocker_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chk_blocks_not_self CHECK (blocker_id <> blocked_id)
);
CREATE UNIQUE INDEX idx_blocks_blocker_blocked ON blocks (blocker_id, blocked_id);

CREATE TABLE bookmarks (
  id SERIAL PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX idx_bookmarks_user_post ON bookmarks (user_id, post_id);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(20) NOT NULL,
  post_id integer REFERENCES posts(id) ON DELETE CASCADE,
  comment_id integer REFERENCES comments(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

-- Added by migration 024_add_notification_preferences (B11).
CREATE TABLE notification_preferences (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  likes boolean NOT NULL DEFAULT true,
  comments boolean NOT NULL DEFAULT true,
  mentions boolean NOT NULL DEFAULT true,
  follows boolean NOT NULL DEFAULT true,
  follow_accepted boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Added by migration 037_add_message_notification_settings (Day 23).
  messages boolean NOT NULL DEFAULT true
);

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  reporter_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type report_target_type NOT NULL,
  target_id integer NOT NULL,
  reason varchar(50) NOT NULL,
  details text,
  status report_status DEFAULT 'pending'::report_status NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  -- Added by migration 025_add_admin_moderation (B12).
  resolved_by integer REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution varchar(20) CONSTRAINT chk_reports_resolution CHECK (resolution IN ('dismissed', 'content_removed', 'user_banned', 'user_suspended')),
  -- Added by migration 031_report_comments_messages (Day 12).
  target_owner_id integer REFERENCES users(id) ON DELETE SET NULL,
  target_snapshot text
);
CREATE INDEX idx_reports_target_owner ON reports (target_owner_id) WHERE target_owner_id IS NOT NULL;

CREATE TABLE messages_dm_legacy (
  id SERIAL PRIMARY KEY,
  sender_id integer NOT NULL REFERENCES users(id),
  receiver_id integer NOT NULL REFERENCES users(id),
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

-- Day 8 (migration 028): login sessions, so tokens can be revoked.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text
);
CREATE INDEX idx_sessions_user_active ON sessions (user_id) WHERE revoked_at IS NULL;

-- Day 9 (migration 029): the cleanup job's time-based scans.
CREATE INDEX idx_stories_expires_at ON stories (expires_at);
CREATE INDEX idx_notifications_created_at ON notifications (created_at);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

-- Day 10 (migration 030): built-in error log, one row per distinct error.
CREATE TABLE error_groups (
  fingerprint char(40) PRIMARY KEY,
  source varchar(10) NOT NULL CHECK (source IN ('api', 'socket', 'process', 'client')),
  route text,
  message text NOT NULL,
  stack text,
  status integer,
  count integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  last_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz
);
CREATE INDEX idx_error_groups_last_seen ON error_groups (last_seen DESC);

-- Day 19 (migration 034): link preview cache.
CREATE TABLE link_previews (
  url_hash CHAR(64) PRIMARY KEY,
  url TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  title TEXT,
  description TEXT,
  site_name TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_link_previews_fetched_at ON link_previews (fetched_at);

-- Day 22 (migration 036): web push subscriptions, one per browser.
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user_id);


-- Indexes production already has from migrations 001-014, 015, 018, 019
-- and 022. This fixture lacked them until Day 27; the rehearsal now
-- compares indexes too, so the two can't drift apart again.
-- 003-014 (before migration tracking; the snapshot above has no indexes):
CREATE INDEX idx_messages_conversation_created_at ON messages (conversation_id, created_at DESC);
CREATE INDEX idx_blocks_blocked_id ON blocks (blocked_id);
CREATE INDEX idx_reports_target_pending ON reports (target_type, target_id) WHERE status = 'pending';
CREATE INDEX idx_reports_reporter_id ON reports (reporter_id, created_at DESC);
CREATE INDEX idx_bookmarks_user_created_at ON bookmarks (user_id, created_at DESC);
CREATE INDEX idx_follows_following_status ON follows (following_id, status);
CREATE INDEX idx_users_verification_token ON users (verification_token) WHERE verification_token IS NOT NULL;
-- (010's idx_post_hashtags_hashtag_id was replaced by 039's idx_post_hashtags_hashtag.)
-- 001_add_performance_indexes.sql:
CREATE INDEX idx_posts_user_id ON posts (user_id);
CREATE INDEX idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX idx_comments_post_id_created_at ON comments (post_id, created_at);
CREATE INDEX idx_notifications_user_id_created_at ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE is_read = false;
CREATE INDEX idx_notifications_post_id ON notifications (post_id);
CREATE INDEX idx_notifications_comment_id ON notifications (comment_id);
CREATE INDEX idx_follows_following_id ON follows (following_id);
CREATE INDEX idx_users_reset_token ON users (reset_token) WHERE reset_token IS NOT NULL;
-- 002_add_trigram_search_indexes.sql (search: ILIKE '%text%'):
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_username_trgm ON users USING GIN (username gin_trgm_ops);
CREATE INDEX idx_posts_content_trgm ON posts USING GIN (content gin_trgm_ops);
CREATE INDEX idx_posts_content_fts ON posts USING GIN (to_tsvector('english', content));
CREATE INDEX idx_hashtags_tag_trgm ON hashtags USING GIN (LOWER(tag) gin_trgm_ops);
-- 015_add_fk_lookup_indexes:
CREATE INDEX idx_conversation_participants_user_id ON conversation_participants (user_id);
CREATE INDEX idx_comments_user_id ON comments (user_id);
CREATE INDEX idx_likes_user_id ON likes (user_id);
CREATE INDEX idx_notifications_actor_id ON notifications (actor_id);
CREATE INDEX idx_messages_sender_id ON messages (sender_id);
CREATE INDEX idx_bookmarks_post_id ON bookmarks (post_id);
-- 018 / 019 / 022 (also missing here until Day 27):
CREATE INDEX idx_stories_user_expires ON stories (user_id, expires_at);
CREATE INDEX idx_comments_parent_comment_id ON comments (parent_comment_id);
CREATE INDEX idx_comment_likes_user_id ON comment_likes (user_id);
CREATE INDEX idx_messages_reply_to ON messages (reply_to_message_id);

-- Day 27 (migration 039): the indexes still missing after those.
CREATE INDEX idx_messages_conversation_id ON messages (conversation_id, id);
CREATE INDEX idx_post_hashtags_hashtag ON post_hashtags (hashtag_id, post_id);
CREATE INDEX idx_participants_last_read ON conversation_participants (last_read_message_id) WHERE last_read_message_id IS NOT NULL;
CREATE INDEX idx_story_views_viewer ON story_views (viewer_id);

-- Day 31 (migration 040): reactions on messages.
CREATE TABLE message_reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction VARCHAR(10) NOT NULL
    CONSTRAINT chk_message_reactions_reaction CHECK (reaction IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX idx_message_reactions_user ON message_reactions (user_id);

-- Day 32 (migration 041): forwarded messages are labelled.
ALTER TABLE messages ADD COLUMN is_forwarded BOOLEAN NOT NULL DEFAULT false;

-- Day 34 (migration 042): a group chat's photo.
ALTER TABLE conversations ADD COLUMN avatar_url TEXT;

-- Day 36 (migration 043): links on a profile.
ALTER TABLE users ADD COLUMN links TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD CONSTRAINT chk_users_links_count CHECK (cardinality(links) <= 3);

-- Day 36 (migration 044): a profile's cover photo.
ALTER TABLE users ADD COLUMN cover_url TEXT;

-- Day 36 (migration 045): a post pinned to the top of a profile.
ALTER TABLE users ADD COLUMN pinned_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL;
CREATE INDEX idx_users_pinned_post ON users (pinned_post_id) WHERE pinned_post_id IS NOT NULL;

-- Day 39 (migration 046): people hidden from your suggestions.
CREATE TABLE suggestion_dismissals (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dismissed_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dismissed_user_id)
);
-- The PK covers "who did I hide"; this covers the cascade when the hidden
-- person's account is deleted.
CREATE INDEX idx_suggestion_dismissals_dismissed ON suggestion_dismissals (dismissed_user_id);

-- Migration 049: recent searches (Day 42).
CREATE TABLE search_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query VARCHAR(100) NOT NULL CHECK (query <> ''),
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_search_history_user_query ON search_history (user_id, LOWER(query));
CREATE INDEX idx_search_history_user_recent ON search_history (user_id, searched_at DESC);

-- Added by migration 050_add_polls (Day 44): poll posts. The post's text
-- is the question; one anonymous vote per person per poll.
CREATE TABLE polls (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  closes_at TIMESTAMPTZ NOT NULL,
  -- Added by migration 053_add_poll_ended_notified (Day 45).
  ended_notified BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_polls_end_queue ON polls (closes_at) WHERE NOT ended_notified;
CREATE TABLE poll_options (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  label VARCHAR(50) NOT NULL CHECK (btrim(label) <> ''),
  UNIQUE (post_id, position)
);
CREATE TABLE poll_votes (
  post_id INTEGER NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_poll_votes_user ON poll_votes (user_id);
CREATE INDEX idx_poll_votes_option ON poll_votes (option_id);

-- Added by migration 052_add_post_drafts (Day 45): drafts and scheduled
-- posts, private to their author until published.
CREATE TABLE post_drafts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  visibility VARCHAR(10) NOT NULL DEFAULT 'public'
    CONSTRAINT chk_post_drafts_visibility CHECK (visibility IN ('public', 'followers', 'only_me')),
  community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE,
  page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  poll JSONB,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  scheduled_for TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_post_drafts_user ON post_drafts (user_id, updated_at DESC);
CREATE INDEX idx_post_drafts_due ON post_drafts (scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX idx_post_drafts_community ON post_drafts (community_id) WHERE community_id IS NOT NULL;
CREATE INDEX idx_post_drafts_page ON post_drafts (page_id) WHERE page_id IS NOT NULL;

-- Added by migration 054_add_bookmark_collections (Day 46): saved posts in
-- named collections.
CREATE TABLE bookmark_collections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL CONSTRAINT chk_bookmark_collections_name CHECK (btrim(name) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_bookmark_collections_user_name ON bookmark_collections (user_id, lower(name));
CREATE TABLE bookmark_collection_items (
  collection_id INTEGER NOT NULL REFERENCES bookmark_collections(id) ON DELETE CASCADE,
  bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, bookmark_id)
);
CREATE INDEX idx_bookmark_collection_items_bookmark ON bookmark_collection_items (bookmark_id);

-- Added by migration 055_add_user_mutes (Day 47): muted people.
CREATE TABLE user_mutes (
  muter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CONSTRAINT chk_user_mutes_not_self CHECK (muter_id <> muted_id)
);
CREATE INDEX idx_user_mutes_muted ON user_mutes (muted_id);
