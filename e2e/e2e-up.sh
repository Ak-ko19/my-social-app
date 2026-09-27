#!/bin/bash
# Throwaway local stack for the browser suites. Never touches .env's database:
# it uses the backend test cluster (port 55433) and a fresh mysocialapp_e2e DB.
# PostgreSQL tools come from $PG_BIN (default: PostgreSQL 17 on Windows).
SP="$(cd "$(dirname "$0")" && pwd)"
PG="${PG_BIN:-/c/Program Files/PostgreSQL/17/bin}"
B="$(cd "$SP/../backend" && pwd)"
set -e
"$PG/pg_ctl.exe" -D "$B/tests/.pgdata_test_cluster" status >/dev/null 2>&1 || \
  "$PG/pg_ctl.exe" -D "$B/tests/.pgdata_test_cluster" -l "$B/tests/.pgdata_test_cluster.log" -o '-p 55433 -k ""' -w start >/dev/null 2>&1 </dev/null
"$PG/dropdb.exe" -h localhost -p 55433 -U testuser --if-exists mysocialapp_e2e 2>/dev/null
"$PG/createdb.exe" -h localhost -p 55433 -U testuser mysocialapp_e2e
"$PG/psql.exe" -q -h localhost -p 55433 -U testuser -d mysocialapp_e2e -v ON_ERROR_STOP=1 -f "$B/tests/fixtures/schema.sql"
cd "$B"
NODE_ENV=test DATABASE_URL=postgresql://testuser@localhost:55433/mysocialapp_e2e JWT_SECRET=e2e-local-only-secret \
ALLOWED_ORIGINS=http://localhost:5173 FRONTEND_URL=http://localhost:5173 EMAIL_HOST= EMAIL_USER= EMAIL_PASS= \
CLOUDINARY_CLOUD_NAME= CLOUDINARY_API_KEY= CLOUDINARY_API_SECRET= nohup node server.js > "$SP/backend.log" 2>&1 &
cd ../frontend
VITE_API_URL=http://localhost:3000 nohup npx vite --port 5173 --strictPort > "$SP/vite.log" 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null localhost:3000/ && curl -s -o /dev/null localhost:5173/ && break; sleep 0.5; done
# Seed: alice(1), bob(2), a conversation, a post.
for u in alice bob; do curl -s -X POST localhost:3000/signup -H 'Content-Type: application/json' \
  -d "{\"username\":\"$u\",\"email\":\"$u@example.com\",\"password\":\"a-fine-password-123\"}" >/dev/null; done
tok() { curl -s -X POST localhost:3000/login -H 'Content-Type: application/json' -d "{\"email\":\"$1@example.com\",\"password\":\"a-fine-password-123\"}" | node -pe "JSON.parse(require('fs').readFileSync(0)).token"; }
tok alice > "$SP/alice.token"; tok bob > "$SP/bob.token"
BT=$(cat "$SP/bob.token")
curl -s -X POST localhost:3000/conversations -H "Authorization: Bearer $BT" -H 'Content-Type: application/json' -d '{"userId":1}' >/dev/null
curl -s -X POST localhost:3000/posts -H "Authorization: Bearer $BT" -F 'content=Hello from bob #welcome' >/dev/null
curl -s -X POST localhost:3000/users/2/follow -H "Authorization: Bearer $(cat "$SP/alice.token")" >/dev/null || true
echo "e2e stack up"
