// Days 114-115: seals the two-factor keys stored before TOTP_ENCRYPTION_KEY
// was set (utils/secretBox.js). The app also seals each one the next time
// its owner logs in with a code; this does all of them at once.
//
//   npm run seal:totp                 # dry run: counts only
//   npm run seal:totp -- --apply      # seal them
//
// Needs DATABASE_URL and the SAME TOTP_ENCRYPTION_KEY the server uses
// (GO_LIVE_CHECKLIST.md). Take a backup first, like any data change.
//
// Safety:
// - Without a valid key it stops before reading anything.
// - It first checks that every key ALREADY sealed opens with this key: if
//   one doesn't (a different key than the server's), it stops and changes
//   nothing.
// - A row is written only if it still holds the plain key that was read
//   (2FA turned off or set up again meanwhile is left alone).
// - Running it again changes nothing.
require('dotenv').config();
const secretBox = require('../utils/secretBox');

const BATCH_SIZE = 500;
const COLUMNS = ['totp_secret', 'totp_pending_secret'];
const aadFor = (userId) => `totp:${userId}`; // as services/twoFactorService.js

function parseArgs(argv) {
  const unknown = argv.filter((a) => a !== '--apply');
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(' ')} (the only option is --apply).`);
  return { apply: argv.includes('--apply') };
}

// Rows with a value in either column, by id, a batch at a time.
async function* rows(db, where) {
  let after = 0;
  for (;;) {
    const batch = (await db.query(
      `SELECT id, totp_secret, totp_pending_secret FROM users WHERE id > $1 AND (${where}) ORDER BY id LIMIT ${BATCH_SIZE}`,
      [after]
    )).rows;
    if (batch.length === 0) return;
    yield* batch;
    after = batch[batch.length - 1].id;
  }
}

const SEALED_SQL = COLUMNS.map((c) => `${c} LIKE 'v1:%'`).join(' OR ');
const PLAIN_SQL = COLUMNS.map((c) => `(${c} IS NOT NULL AND ${c} NOT LIKE 'v1:%')`).join(' OR ');

// Returns the process exit code. The database is passed in, so a test can
// run it against the test database.
async function run({ argv, db, log = console.log }) {
  const { apply } = parseArgs(argv);
  try {
    if (!secretBox.hasKey()) {
      log('TOTP_ENCRYPTION_KEY is not set. Set it (the same value as the server) and run this again.');
      return 2;
    }
  } catch (err) {
    log(err.message);
    return 2;
  }

  let unreadable = 0;
  for await (const row of rows(db, SEALED_SQL)) {
    for (const column of COLUMNS) {
      if (!secretBox.isSealed(row[column])) continue;
      try {
        secretBox.open(row[column], aadFor(row.id));
      } catch {
        unreadable += 1;
      }
    }
  }
  if (unreadable > 0) {
    log(`${unreadable} key(s) already sealed do NOT open with this TOTP_ENCRYPTION_KEY. Is it the server's key? Nothing was changed.`);
    return 1;
  }

  let plain = 0;
  let sealed = 0;
  let changedMeanwhile = 0;
  for await (const row of rows(db, PLAIN_SQL)) {
    for (const column of COLUMNS) {
      const value = row[column];
      if (value === null || secretBox.isSealed(value)) continue;
      plain += 1;
      if (!apply) continue;
      const updated = await db.query(
        `UPDATE users SET ${column} = $3 WHERE id = $1 AND ${column} = $2 RETURNING id`,
        [row.id, value, secretBox.seal(value, aadFor(row.id))]
      );
      if (updated.rows.length > 0) sealed += 1;
      else changedMeanwhile += 1;
    }
  }

  if (!apply) {
    log(`${plain} two-factor key(s) are stored unsealed. Run with --apply to seal them.`);
  } else {
    log(`Sealed ${sealed} two-factor key(s).${changedMeanwhile ? ` ${changedMeanwhile} changed meanwhile and were left alone (run again to check).` : ''}`);
  }
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) {
  const argv = process.argv.slice(2);
  try {
    parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(2);
  }
  const db = require('../db');
  run({ argv, db })
    .then((code) => { process.exitCode = code; })
    .catch((err) => { console.error('Sealing failed:', err.message || err); process.exitCode = 1; })
    .finally(() => db.end());
}
