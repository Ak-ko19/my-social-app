-- Migration: 058_add_interaction_permissions (UP)
-- Purpose: Day 47 -- who can message me (everyone / people I follow / no
-- one new) and who can comment on my posts (everyone / my followers /
-- people I follow). Everyone, as before, until changed.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS message_permission varchar(10) NOT NULL DEFAULT 'everyone';
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_message_permission;
ALTER TABLE users ADD CONSTRAINT chk_users_message_permission CHECK (message_permission IN ('everyone', 'following', 'nobody'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS comment_permission varchar(10) NOT NULL DEFAULT 'everyone';
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_comment_permission;
ALTER TABLE users ADD CONSTRAINT chk_users_comment_permission CHECK (comment_permission IN ('everyone', 'followers', 'following'));
COMMIT;
