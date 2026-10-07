-- Migration: 052_add_post_drafts (UP)
-- Purpose: Day 45 -- drafts and scheduled posts, like Facebook's Drafts and
-- Scheduled lists. They live here, private to their author, and become real
-- posts only when published (by the author, or by the scheduler at
-- scheduled_for), so no post listing needs a "not published yet" filter.
-- The photos are already uploaded (media_urls) and become the post's.

BEGIN;
CREATE TABLE IF NOT EXISTS post_drafts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  visibility VARCHAR(10) NOT NULL DEFAULT 'public'
    CONSTRAINT chk_post_drafts_visibility CHECK (visibility IN ('public', 'followers', 'only_me')),
  -- A draft for a group or page goes with it (the photos are deleted by
  -- the group's/page's own deletion).
  community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE,
  page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  -- { "labels": [...], "durationHours": n }, as POST /posts takes it.
  poll JSONB,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  -- Set: a scheduled post, published by the scheduler at that time.
  scheduled_for TIMESTAMPTZ,
  -- Why the scheduler couldn't publish it (it's back to being a draft).
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A person's drafts, newest first.
CREATE INDEX IF NOT EXISTS idx_post_drafts_user ON post_drafts (user_id, updated_at DESC);
-- The scheduler's queue.
CREATE INDEX IF NOT EXISTS idx_post_drafts_due ON post_drafts (scheduled_for) WHERE scheduled_for IS NOT NULL;
-- The cascades from a deleted group or page.
CREATE INDEX IF NOT EXISTS idx_post_drafts_community ON post_drafts (community_id) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_drafts_page ON post_drafts (page_id) WHERE page_id IS NOT NULL;
COMMIT;
