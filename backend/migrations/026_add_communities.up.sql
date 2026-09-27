-- Migration: 026_add_communities (UP)
-- Purpose: B13 Groups -- Facebook-style communities you join and post in.
-- Named "communities" in the schema/code to stay distinct from B10's
-- group CHATS (conversations.type = 'group'); the UI calls them Groups.
--
-- privacy: 'public' (anyone can read; joining is instant) or 'private'
-- (only members read; joining creates a pending request an admin approves).
-- community_members.status: 'member' | 'pending' (a join request).
-- posts.community_id: NULL for normal posts; set for posts made inside a
-- community, which then follow the community's rules instead of the
-- author's feed audience.

BEGIN;

CREATE TABLE communities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
  description TEXT,
  privacy VARCHAR(10) NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'private')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE community_members (
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (status IN ('member', 'pending')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

-- "Which communities am I in" + account-deletion cascade.
CREATE INDEX idx_community_members_user ON community_members (user_id);

ALTER TABLE posts ADD COLUMN community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE;
CREATE INDEX idx_posts_community_created ON posts (community_id, created_at DESC) WHERE community_id IS NOT NULL;

COMMIT;
