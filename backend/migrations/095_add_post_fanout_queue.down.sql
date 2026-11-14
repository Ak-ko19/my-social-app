-- Migration: 095_add_post_fanout_queue (DOWN)
-- Back to telling every member / follower inside the post request. Jobs
-- still waiting are dropped: those posts' remaining notifications are not
-- sent.

BEGIN;

DROP TABLE IF EXISTS post_fanout_queue;

COMMIT;
