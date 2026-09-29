#!/bin/bash
# GO LIVE rehearsal (GO_LIVE_CHECKLIST.md): runs the production migrations on
# a local, production-shaped copy of the schema -- never on production.
#
#   bash golive-rehearsal.sh            # new code only
#   bash golive-rehearsal.sh --old      # also the live (master) code, i.e.
#                                       # the migration window + rollback B
#
# 1. Builds the live schema: the test fixture at commit e542027 (migration
#    014, the state production was left in) + 001/002's indexes, with
#    realistic 014-era data (Myanmar/Arabic text, image posts, likes,
#    comments, a DM with a voice note).
# 2. Runs every migrations/NNN_*.up.sql from 015 on, one file per command,
#    exactly as the checklist does. New migrations are picked up by
#    themselves.
# 3. Checks the result matches the dev schema (tests/fixtures/schema.sql)
#    column for column and constraint for constraint.
# 4. API smoke (golive-smoke.cjs) with the new backend -- and with --old,
#    the master backend (git worktree) -- each on a fresh migrated copy.
# 5. Rollback A: every .down.sql newest first must bring back the 014
#    schema exactly, keeping the data; then up again.
# Uses the backend test cluster (port 55433) like the other suites.
SP="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SP/.." && pwd)"
B="$REPO/backend"
PG="${PG_BIN:-/c/Program Files/PostgreSQL/17/bin}"
DB=golive_rehearsal
URL="postgresql://testuser@localhost:55433/$DB"
BASE_COMMIT=e542027
WORK="$SP/.golive-rehearsal"
OLD=0; [ "$1" = "--old" ] && OLD=1
mkdir -p "$WORK"
failed=0
ok() { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; failed=1; }
psql_() { "$PG/psql.exe" "$@"; }

MIGRATIONS=$(cd "$B/migrations" && ls [0-9][0-9][0-9]_*.up.sql | awk -F_ '$1 >= 15' | sed 's/\.up\.sql$//' | sort)
COLS="SELECT table_name||'.'||column_name||' '||data_type||' null='||is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY 1"
CONS="SELECT table_name||' '||constraint_type||' '||constraint_name FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type IN ('PRIMARY KEY','UNIQUE','FOREIGN KEY','CHECK') AND constraint_name NOT LIKE '%_not_null' ORDER BY 1"

"$PG/pg_ctl.exe" -D "$B/tests/.pgdata_test_cluster" status >/dev/null 2>&1 || \
  "$PG/pg_ctl.exe" -D "$B/tests/.pgdata_test_cluster" -l "$B/tests/.pgdata_test_cluster.log" -o '-p 55433 -k ""' -w start >/dev/null 2>&1 </dev/null

fresh_db() { # $1 = database name, $2 = schema source ("live" or "dev")
  local url="postgresql://testuser@localhost:55433/$1"
  "$PG/dropdb.exe" -h localhost -p 55433 -U testuser --if-exists "$1" 2>/dev/null
  "$PG/createdb.exe" -h localhost -p 55433 -U testuser "$1"
  if [ "$2" = dev ]; then psql_ -q -v ON_ERROR_STOP=1 "$url" -f "$B/tests/fixtures/schema.sql" >/dev/null; return; fi
  git -C "$REPO" show "$BASE_COMMIT:backend/tests/fixtures/schema.sql" | psql_ -q -v ON_ERROR_STOP=1 "$url" >/dev/null
  psql_ -q "$url" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm" >/dev/null
  # 001 ran before 003 renamed the old messages table, so its two
  # sender/receiver indexes can't apply here: those errors are expected.
  for f in 001_add_performance_indexes.sql 002_add_trigram_search_indexes.sql; do
    git -C "$REPO" show "master:backend/migrations/$f" | psql_ -q "$url" >/dev/null 2>&1
  done
  psql_ -q -v ON_ERROR_STOP=1 "$url" <<'SQL'
INSERT INTO users (username, email, password, bio, avatar_url, email_verified) VALUES
  ('thiri', 'thiri@example.com', 'x', 'ရန်ကုန်', 'https://res.cloudinary.com/prod/image/upload/v1/avatars/a1.jpg', true),
  ('omar', 'omar@example.com', 'x', 'مرحبا', NULL, false),
  ('kyaw', 'kyaw@example.com', 'x', NULL, NULL, false);
INSERT INTO posts (user_id, content, image_url) VALUES
  (1, 'Shwedagon at sunset #yangon', 'https://res.cloudinary.com/prod/image/upload/v1/posts/p1.jpg'),
  (1, 'text only post', NULL),
  (2, 'صباح الخير', 'https://res.cloudinary.com/prod/image/upload/v1/posts/p2.jpg');
INSERT INTO follows (follower_id, following_id) VALUES (2, 1), (3, 1), (1, 2);
INSERT INTO likes (post_id, user_id) VALUES (1, 2), (1, 3), (3, 1);
INSERT INTO comments (post_id, user_id, content) VALUES (1, 2, 'Beautiful!'), (1, 3, 'လှလိုက်တာ');
INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES (1, 2, 'like', 1);
INSERT INTO conversations (type, user_a_id, user_b_id) VALUES ('direct', 1, 2);
INSERT INTO conversation_participants (conversation_id, user_id) VALUES (1, 1), (1, 2);
INSERT INTO messages (conversation_id, sender_id, type, content, media_url, duration_seconds) VALUES
  (1, 1, 'text', 'မင်္ဂလာပါ', NULL, NULL),
  (1, 2, 'voice', NULL, 'https://res.cloudinary.com/prod/video/upload/v1/voice-messages/v1.mp3', 5);
SQL
}

run_migrations() { # $1 = up|down
  local list="$MIGRATIONS"
  [ "$1" = down ] && list=$(echo "$MIGRATIONS" | sort -r)
  for m in $list; do
    (cd "$B" && DATABASE_URL="$URL" node scripts/run-migration.js "migrations/$m.$1.sql" 2>&1 | grep -q "applied successfully") \
      || { bad "$1 $m"; return 1; }
  done
  ok "all $(echo "$MIGRATIONS" | wc -w) migrations $1 ($(echo "$MIGRATIONS" | head -1 | cut -c1-3)..$(echo "$MIGRATIONS" | tail -1 | cut -c1-3))"
}

smoke() { # $1 = new|old
  local dir="$B"
  if [ "$1" = old ]; then
    rm -rf "$WORK/master"; git -C "$REPO" worktree prune
    git -C "$REPO" worktree add -f "$WORK/master" master >/dev/null 2>&1 || { bad "worktree for master"; return; }
    (cd "$WORK/master/backend" && npm ci --silent >/dev/null 2>&1) || { bad "npm ci for master"; return; }
    dir="$WORK/master/backend"
  fi
  fresh_db $DB live && run_migrations up >/dev/null || return
  local P; P=$(netstat -ano | grep ':3000 ' | grep LISTEN | awk '{print $5}' | head -1); [ -n "$P" ] && taskkill //PID $P //F >/dev/null
  (cd "$dir" && env NODE_ENV=test PORT=3000 DATABASE_URL="$URL" JWT_SECRET=rehearsal-only-secret ALLOWED_ORIGINS=http://localhost:5173 \
    FRONTEND_URL=http://localhost:5173 RENDER= TRUST_PROXY= BREVO_API_KEY= EMAIL_HOST= EMAIL_USER= EMAIL_PASS= \
    CLOUDINARY_CLOUD_NAME= CLOUDINARY_API_KEY= CLOUDINARY_API_SECRET= nohup node server.js > "$WORK/$1-backend.log" 2>&1 &)
  for i in $(seq 1 40); do curl -s -o /dev/null localhost:3000/ && break; sleep 0.5; done
  node "$SP/golive-smoke.cjs" http://localhost:3000 "$1" || failed=1
  P=$(netstat -ano | grep ':3000 ' | grep LISTEN | awk '{print $5}' | head -1); [ -n "$P" ] && taskkill //PID $P //F >/dev/null
  [ "$(grep -ciE 'error' "$WORK/$1-backend.log")" = 0 ] && ok "[$1] no server errors" || bad "[$1] server errors, see $WORK/$1-backend.log"
  if [ "$1" = old ]; then git -C "$REPO" worktree remove --force "$WORK/master"; fi
}

echo "Migrations: $(echo $MIGRATIONS)"
# 1-3. Migrate a live-shaped copy and compare with the dev schema.
fresh_db $DB live
psql_ "$URL" -At -c "$COLS" > "$WORK/cols-live.txt"; psql_ "$URL" -At -c "$CONS" > "$WORK/cons-live.txt"
[ "$(psql_ "$URL" -At -c "SELECT count(*) FROM information_schema.columns WHERE table_name='users' AND column_name='verification_token'")" = 1 ] \
  && ok "base is the live schema (migration 014)" || bad "base schema"
run_migrations up
fresh_db schema_dev dev
psql_ postgresql://testuser@localhost:55433/schema_dev -At -c "$COLS" > "$WORK/cols-dev.txt"
psql_ postgresql://testuser@localhost:55433/schema_dev -At -c "$CONS" > "$WORK/cons-dev.txt"
psql_ "$URL" -At -c "$COLS" > "$WORK/cols-migrated.txt"; psql_ "$URL" -At -c "$CONS" > "$WORK/cons-migrated.txt"
diff -q "$WORK/cols-migrated.txt" "$WORK/cols-dev.txt" >/dev/null && ok "columns match the dev schema ($(wc -l < "$WORK/cols-dev.txt"))" || { bad "columns differ from dev schema:"; diff "$WORK/cols-migrated.txt" "$WORK/cols-dev.txt" | head -20; }
diff -q "$WORK/cons-migrated.txt" "$WORK/cons-dev.txt" >/dev/null && ok "constraints match the dev schema ($(wc -l < "$WORK/cons-dev.txt"))" || { bad "constraints differ from dev schema:"; diff "$WORK/cons-migrated.txt" "$WORK/cons-dev.txt" | head -20; }
[ "$(psql_ "$URL" -At -c "SELECT (SELECT count(*) FROM users)||'/'||(SELECT count(*) FROM posts)||'/'||(SELECT count(*) FROM likes)||'/'||(SELECT count(*) FROM comments)||'/'||(SELECT count(*) FROM messages)")" = "3/3/3/2/2" ] \
  && ok "all 014-era rows kept" || bad "rows lost"
"$PG/dropdb.exe" -h localhost -p 55433 -U testuser --if-exists schema_dev

# 5. Rollback A: down to exactly the live schema, data kept, then up again.
run_migrations down
psql_ "$URL" -At -c "$COLS" > "$WORK/cols-down.txt"; psql_ "$URL" -At -c "$CONS" > "$WORK/cons-down.txt"
diff -q "$WORK/cols-down.txt" "$WORK/cols-live.txt" >/dev/null && diff -q "$WORK/cons-down.txt" "$WORK/cons-live.txt" >/dev/null \
  && ok "rollback A: downs restore the live schema exactly" || bad "rollback A: schema after downs differs from live"
[ "$(psql_ "$URL" -At -c "SELECT (SELECT count(*) FROM users)||'/'||(SELECT count(*) FROM posts)||'/'||(SELECT count(*) FROM messages)")" = "3/3/2" ] \
  && ok "rollback A: data kept" || bad "rollback A: rows lost"
run_migrations up

# 4. API smoke on fresh migrated copies.
smoke new
[ $OLD = 1 ] && smoke old

"$PG/dropdb.exe" -h localhost -p 55433 -U testuser --if-exists $DB
[ $failed = 0 ] && echo "REHEARSAL PASSED" || echo "REHEARSAL FAILED"
exit $failed
