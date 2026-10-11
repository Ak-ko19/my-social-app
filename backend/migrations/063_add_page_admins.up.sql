-- Migration: 063_add_page_admins (UP)
-- Purpose: Day 53 -- page admins (Facebook's Page roles, simplified): the
-- owner adds people who may edit the page, post as it and manage its
-- posts. The owner stays pages.owner_id; page posts keep the owner as
-- posts.user_id whoever writes them.

BEGIN;
CREATE TABLE IF NOT EXISTS page_admins (
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);
-- "Pages I manage", and the cascade from a deleted account.
CREATE INDEX IF NOT EXISTS idx_page_admins_user ON page_admins (user_id);
COMMIT;
