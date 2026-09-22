-- Migration: 013_cascade_account_delete (DOWN)
BEGIN;

ALTER TABLE messages DROP CONSTRAINT messages_sender_id_fkey1;
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey1
  FOREIGN KEY (sender_id) REFERENCES users(id);

ALTER TABLE notifications DROP CONSTRAINT notifications_actor_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id);

ALTER TABLE notifications DROP CONSTRAINT notifications_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE comments DROP CONSTRAINT comments_user_id_fkey;
ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE posts DROP CONSTRAINT posts_user_id_fkey;
ALTER TABLE posts ADD CONSTRAINT posts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id);

COMMIT;
