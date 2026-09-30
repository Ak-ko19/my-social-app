# Sourced by e2e-up.sh / e2e-down.sh: where the PostgreSQL tools are, on the
# developer's Windows machine or CI's Linux runner (same rules as pg.cjs).
#   PG_BIN set            -> that folder
#   Windows default found -> C:/Program Files/PostgreSQL/17/bin
#   otherwise             -> the tools on PATH (CI: postgresql-client)
# Usage: "$(pgtool psql)" -h localhost ...
PG_DIR="${PG_BIN:-}"
if [ -z "$PG_DIR" ] && [ -d "/c/Program Files/PostgreSQL/17/bin" ]; then
  PG_DIR="/c/Program Files/PostgreSQL/17/bin"
fi
pgtool() {
  if [ -z "$PG_DIR" ]; then echo "$1"
  elif [ -e "$PG_DIR/$1.exe" ]; then echo "$PG_DIR/$1.exe"
  else echo "$PG_DIR/$1"
  fi
}

# Stops whatever listens on a TCP port (a stack left over from a crashed run).
free_port() {
  if command -v taskkill >/dev/null 2>&1; then
    local pid
    pid=$(netstat -ano | grep ":$1 " | grep LISTEN | awk '{print $5}' | head -1)
    [ -n "$pid" ] && taskkill //PID "$pid" //F //T >/dev/null
  else
    fuser -k -n tcp "$1" >/dev/null 2>&1
  fi
  return 0
}
