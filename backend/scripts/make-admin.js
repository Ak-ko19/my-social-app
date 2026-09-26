// B12: grant (or with --revoke, remove) admin rights. There is deliberately
// no API/UI for this -- nobody can promote themselves.
// Usage (from backend/, against the DATABASE_URL in your environment):
//   node scripts/make-admin.js <username>
//   node scripts/make-admin.js <username> --revoke
require('dotenv').config();
const db = require('../db');

const [username, flag] = process.argv.slice(2);
if (!username) {
  console.error('Usage: node scripts/make-admin.js <username> [--revoke]');
  process.exit(1);
}
const makeAdmin = flag !== '--revoke';

db.query('UPDATE users SET is_admin = $1 WHERE username = $2 RETURNING id, username, is_admin', [makeAdmin, username])
  .then((result) => {
    if (result.rows.length === 0) {
      console.error(`No user named "${username}".`);
      process.exit(1);
    }
    const u = result.rows[0];
    console.log(`${u.username} (id ${u.id}) is ${u.is_admin ? 'now an admin' : 'no longer an admin'}.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
  });
