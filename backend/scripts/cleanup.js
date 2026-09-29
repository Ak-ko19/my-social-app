// Runs the Day 9 daily cleanup directly against DATABASE_URL (the same
// work as POST /internal/cleanup, which the scheduled GitHub Action calls).
//   npm run cleanup                # delete
//   npm run cleanup -- --dry-run   # only count what would go
require('dotenv').config();

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--dry-run');
if (unknown.length > 0) {
  console.error(`Unknown option ${unknown[0]}. Use --dry-run to only count.`);
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}

const db = require('../db');
const { run } = require('../services/cleanupService');

run({ dryRun: args.includes('--dry-run') })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error('Cleanup failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => db.end());
