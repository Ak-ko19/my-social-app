#!/bin/bash
# Throwaway local stack for the browser suites. Never touches .env's database:
# it uses the backend test cluster (port 55433) and a fresh mysocialapp_e2e DB.
# PostgreSQL tools: see pg-tools.sh. With E2E_EXTERNAL_DB=1 (CI) the
# database server isn't ours to stop.
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/pg-tools.sh"
B="$(cd "$SP/../backend" && pwd)"
for p in 3000 5173 3901; do free_port $p; done
"$(pgtool dropdb)" -h localhost -p 55433 -U testuser --if-exists mysocialapp_e2e 2>/dev/null
if [ "$E2E_EXTERNAL_DB" != 1 ]; then
  "$(pgtool pg_ctl)" -D "$B/tests/.pgdata_test_cluster" stop -m fast >/dev/null 2>&1
fi
echo "e2e stack down"
