// Where psql lives, for suites that set up data with SQL. Works on the
// developer's Windows machine and on CI's Linux runner:
//   PG_BIN set            -> that folder (psql.exe on Windows, else psql)
//   Windows default found -> C:/Program Files/PostgreSQL/17/bin/psql.exe
//   otherwise             -> `psql` from PATH (CI: postgresql-client)
// PSQL comes quoted, ready to put at the start of a command line.
const fs = require('fs');
const path = require('path');

const WINDOWS_DEFAULT = 'C:/Program Files/PostgreSQL/17/bin';

// Git Bash style "/c/Program Files/..." (what the README suggests for
// PG_BIN) means C:/Program Files/... to Node on Windows.
function fromGitBash(dir) {
  return process.platform === 'win32' ? dir.replace(/^\/([a-z])\//i, '$1:/') : dir;
}

function findPsql() {
  const dir = process.env.PG_BIN ? fromGitBash(process.env.PG_BIN) : fs.existsSync(WINDOWS_DEFAULT) ? WINDOWS_DEFAULT : '';
  if (!dir) return 'psql';
  const exe = path.join(dir, 'psql.exe');
  return fs.existsSync(exe) ? exe : path.join(dir, 'psql');
}

const PSQL = `"${findPsql()}"`;

module.exports = { PSQL };
