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
CREATE TYPE report_target_type AS ENUM ('post', 'user');

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
  verification_token_expiry timestamptz
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  image_url text,
  -- Added by migration 020_add_post_visibility (B5).
  visibility varchar(10) DEFAULT 'public' NOT NULL
    CONSTRAINT chk_posts_visibility CHECK (visibility IN ('public', 'followers'))
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
  updated_at timestamptz NOT NULL DEFAULT now()
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
  resolution varchar(20) CONSTRAINT chk_reports_resolution CHECK (resolution IN ('dismissed', 'content_removed', 'user_banned'))
);

CREATE TABLE messages_dm_legacy (
  id SERIAL PRIMARY KEY,
  sender_id integer NOT NULL REFERENCES users(id),
  receiver_id integer NOT NULL REFERENCES users(id),
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);
