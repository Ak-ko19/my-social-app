// Jest calls this once before the whole test run (not per file). Bootstraps
// a fully isolated, throwaway Postgres cluster for the API test suite --
// see tests/helpers/testDb.js for why this exists instead of pg-mem or the
// app's real DATABASE_URL. Idempotent: safe to run even if the cluster/DB
// already exist from a previous run.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PG_BIN = 'C:\\Program Files\\PostgreSQL\\17\\bin';
const DATA_DIR = path.join(__dirname, '.pgdata_test_cluster');
const PORT = '55433';
const DB_NAME = 'mysocialapp_test';
const DB_USER = 'testuser';
// Kept OUTSIDE the data directory on purpose: Postgres fsyncs every file in
// its data dir during crash recovery, and on Windows the log file (held
// open by postgres) then fails with a "sharing violation", stalling
// startup for 30s+ or aborting it entirely.
const LOG_FILE = path.join(__dirname, '.pgdata_test_cluster.log');

function run(bin, args, opts = {}) {
  return execFileSync(path.join(PG_BIN, bin), args, { encoding: 'utf8', ...opts });
}

module.exports = async function globalSetup() {
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    run('initdb.exe', ['-D', DATA_DIR, '-U', DB_USER, '--auth=trust', '--no-locale', '--encoding=UTF8']);
  }

  const status = spawnSync(path.join(PG_BIN, 'pg_ctl.exe'), ['-D', DATA_DIR, 'status']);
  const alreadyRunning = status.status === 0;

  if (!alreadyRunning) {
    run('pg_ctl.exe', [
      '-D', DATA_DIR,
      '-l', LOG_FILE,
      '-o', `-p ${PORT} -k ""`,
      '-w',
      'start'
    // stdio 'ignore' is required on Windows: the long-lived postgres.exe
    // inherits pg_ctl's stdout/stderr, so with the default pipes
    // execFileSync never sees EOF and hangs the whole test run forever.
    ], { stdio: 'ignore' });
  }

  const dbList = spawnSync(path.join(PG_BIN, 'psql.exe'), [
    '-h', 'localhost', '-p', PORT, '-U', DB_USER, '-lqt'
  ], { encoding: 'utf8' });
  const dbExists = dbList.stdout && dbList.stdout.split('\n').some((line) => line.split('|')[0].trim() === DB_NAME);

  if (!dbExists) {
    run('createdb.exe', ['-h', 'localhost', '-p', PORT, '-U', DB_USER, DB_NAME]);
    run('psql.exe', [
      '-h', 'localhost', '-p', PORT, '-U', DB_USER, '-d', DB_NAME,
      '-v', 'ON_ERROR_STOP=1',
      '-f', path.join(__dirname, 'fixtures', 'schema.sql')
    ]);
  }
};

module.exports.DATA_DIR = DATA_DIR;
