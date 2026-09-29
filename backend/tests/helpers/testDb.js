// Backs every API test's database with a real, throwaway Postgres --
// NOT the app's own DATABASE_URL, and NOT the pre-existing local Postgres
// instance found running on the default port 5432 (no credential for that
// one was available, and guessing one was correctly ruled out).
//
// Instead, tests/ has its own fully isolated cluster: a separate data
// directory (tests/.pgdata_test_cluster, gitignored, created via
// `initdb --auth=trust`) running on port 55433 -- a port nothing else on
// this machine uses. Trust auth means no password exists to leak or
// guess; the cluster is only reachable from this machine and only
// contains disposable test data, recreated fresh for every test run.
//
// This replaces an earlier pg-mem (in-memory Postgres emulator) attempt --
// abandoned after discovering it cannot execute ANY correlated subquery
// referencing the outer query's table (e.g. `NOT EXISTS (SELECT 1 FROM
// blocks WHERE blocks.blocked_id = users.id)`), which is this codebase's
// single most common query pattern (every privacy/block-visibility check).
// See ROADMAP.md's A1 notes for the full decision trail.
//
// No manual step needed: tests/globalSetup.js creates/starts the cluster
// (and loads fixtures/schema.sql) automatically on `npm test`, and
// tests/globalTeardown.js stops it afterwards. Tests connect to it via TEST_DATABASE_URL, defaulted below so no .env
// file is required for this to work.
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://testuser@localhost:55433/mysocialapp_test';

const schemaSql = fs.readFileSync(path.join(__dirname, '../fixtures/schema.sql'), 'utf8');

// One real Pool shared for the whole test run (creating a new Pool per
// test file/reset, like the old pg-mem version did, would exhaust
// Postgres's connection limit fast) -- resetDb() below truncates instead
// of recreating the connection.
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

// Every table this schema defines, in an order safe for
// TRUNCATE ... CASCADE (doesn't actually matter with CASCADE, but keeps
// the list self-documenting as a full inventory of what gets wiped).
const TABLES = [
  'messages_dm_legacy', 'reports', 'notification_preferences', 'notifications', 'bookmarks', 'blocks', 'follows',
  'likes', 'comment_likes', 'comments', 'conversation_participants', 'messages', 'conversations',
  'post_hashtags', 'hashtags', 'post_media', 'community_members', 'communities', 'story_views', 'stories', 'posts', 'sessions', 'error_groups', 'users'
];

async function resetDb() {
  await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

async function closeDb() {
  await pool.end();
}

module.exports = { pool, resetDb, closeDb, TEST_DATABASE_URL, schemaSql };
