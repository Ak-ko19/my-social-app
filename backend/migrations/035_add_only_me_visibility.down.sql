-- Migration: 035_add_only_me_visibility (DOWN)
-- The code before Day 20 treats every audience other than 'followers' as
-- public. Rolling back while "only me" posts exist would publish them, so
-- this refuses instead. To roll back anyway, choose one:
--   - restore the backup taken before GO LIVE (GO_LIVE_CHECKLIST rollback B);
--   - or make them followers-only first (their authors' followers will see
--     them), then run this again:
--       UPDATE posts SET visibility = 'followers' WHERE visibility = 'only_me';
BEGIN;
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM posts WHERE visibility = 'only_me';
  IF n > 0 THEN
    RAISE EXCEPTION '% "only me" post(s) exist. The older code would show them to everyone, so this rollback stops here. See the comment at the top of 035_add_only_me_visibility.down.sql.', n;
  END IF;
END $$;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_posts_visibility;
ALTER TABLE posts ADD CONSTRAINT chk_posts_visibility CHECK (visibility IN ('public', 'followers'));
COMMIT;
