// Jest calls this once after the whole test run. Always stops the
// throwaway test cluster -- it exists only for this test suite, so
// stopping it unconditionally (rather than only if this run started it)
// is simpler and just as correct; the data directory itself is left in
// place so the next run doesn't pay initdb's cost again.
const { execFileSync } = require('child_process');
const path = require('path');

const PG_BIN = 'C:\\Program Files\\PostgreSQL\\17\\bin';
const DATA_DIR = path.join(__dirname, '.pgdata_test_cluster');

module.exports = async function globalTeardown() {
  try {
    execFileSync(path.join(PG_BIN, 'pg_ctl.exe'), ['-D', DATA_DIR, 'stop', '-m', 'fast'], { stdio: 'ignore' });
  } catch (err) {
    // Already stopped, or never started -- not a test failure either way.
  }
};
