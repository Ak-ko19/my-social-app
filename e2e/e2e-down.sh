#!/bin/bash
# Throwaway local stack for the browser suites. Never touches .env's database:
# it uses the backend test cluster (port 55433) and a fresh mysocialapp_e2e DB.
# PostgreSQL tools come from $PG_BIN (default: PostgreSQL 17 on Windows).
SP="$(cd "$(dirname "$0")" && pwd)"
PG="${PG_BIN:-/c/Program Files/PostgreSQL/17/bin}"
B="$(cd "$SP/../backend" && pwd)"
for p in 3000 5173 3901; do P=$(netstat -ano | grep ":$p " | grep LISTEN | awk '{print $5}' | head -1); [ -n "$P" ] && taskkill //PID $P //F //T >/dev/null; done
"$PG/dropdb.exe" -h localhost -p 55433 -U testuser --if-exists mysocialapp_e2e 2>/dev/null
"$PG/pg_ctl.exe" -D "$B/tests/.pgdata_test_cluster" stop -m fast >/dev/null 2>&1
echo "e2e stack down"
