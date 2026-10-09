-- Migration: 058_add_interaction_permissions (DOWN)

BEGIN;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_comment_permission;
ALTER TABLE users DROP COLUMN IF EXISTS comment_permission;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_message_permission;
ALTER TABLE users DROP COLUMN IF EXISTS message_permission;
COMMIT;
