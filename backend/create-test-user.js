// Creates (or resets the password of) a known test user for local testing.
// Usage: node create-test-user.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./db');

const USERNAME = 'testuser';
const EMAIL = 'test@example.com';
const PASSWORD = 'Test1234';

async function main() {
  const hashed = await bcrypt.hash(PASSWORD, 10);

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [EMAIL]);
  if (existing.rows.length > 0) {
    await db.query('UPDATE users SET username = $1, password = $2 WHERE email = $3', [USERNAME, hashed, EMAIL]);
    console.log(`Test user already existed — password reset. id=${existing.rows[0].id}`);
  } else {
    const result = await db.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
      [USERNAME, EMAIL, hashed]
    );
    console.log(`Test user created. id=${result.rows[0].id}`);
  }

  console.log(`Login with: email=${EMAIL}  password=${PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
