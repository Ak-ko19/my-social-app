// Runs a raw SQL migration file from migrations/ against DATABASE_URL.
// Usage: node scripts/run-migration.js migrations/003_upgrade_dm_schema.up.sql
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../db');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-migration.js <path-to-sql-file>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

db.query(sql)
  .then(() => {
    console.log(`Migration applied successfully: ${file}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('MIGRATION FAILED:', err.message);
    process.exit(1);
  });
