-- Migration: 013_cascade_account_delete (UP)
-- Purpose: Account hard-delete (DELETE /profile) needs deleting a user row
-- to cascade to everything that references it -- these FKs were left
-- NO ACTION when originally created (same gap the 2026-09-16 audit flagged
-- and deliberately deferred: see memory "account-deletion-fk-policy").
--
-- Decision (resolved 2026-09-22): CASCADE, not anonymize/ghost-account --
-- deleting an account deletes their posts/comments/notifications and the
-- DM messages they sent (accepting that this leaves gaps in the other
-- participant's conversation, same tradeoff a hard account delete always
-- makes). follows/likes/blocks/reports/bookmarks already cascade (created
-- that way; only these pre-existing FKs needed fixing).
--
-- Metadata-only changes (drop + add constraint), instant on any table size,
-- same as 007's identical fix for comments_post_id_fkey.

BEGIN;

ALTER TABLE posts DROP CONSTRAINT posts_user_id_fkey;
ALTER TABLE posts ADD CONSTRAINT posts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE comments DROP CONSTRAINT comments_user_id_fkey;
ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT notifications_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT notifications_actor_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT messages_sender_id_fkey1;
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey1
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;

COMMIT;
