// Day 43: converts Myanmar text written before Day 43 from Zawgyi to
// Unicode (since then the app converts on the way in -- utils/myanmarText),
// and indexes hashtags the old ASCII-only parser missed (#ရန်ကုန်, #مرحبا).
//
//   npm run convert:zawgyi                # dry run: report only
//   npm run convert:zawgyi -- --apply     # convert and re-index
//
// Needs DATABASE_URL (run it where the production .env is loaded to fix
// production -- after a backup, like any data change).
//
// Safety:
// - Only rows with Myanmar letters are read, in batches of BATCH_SIZE.
// - Text is converted only when the detector is confident (toUnicode);
//   Unicode text is never touched, and running it again changes nothing.
// - A row is written only if it still holds the text that was read, so an
//   edit made meanwhile is never overwritten. No edit timestamp is set:
//   this is a change of encoding, not an edit.
// - A value that would no longer fit its column once converted (some
//   names hold 100 characters) is left as it is and listed.
// - Usernames are not converted: they are how people find and mention
//   each other.
require('dotenv').config();
const { toUnicode } = require('../utils/myanmarText');
const { parseHashtags, syncPostHashtags } = require('../services/hashtagService');

const BATCH_SIZE = 500;
const SAMPLE_SIZE = 10;
// The Myanmar block, built from code points (a Postgres regex).
const MYANMAR_SQL = `[${String.fromCharCode(0x1000)}-${String.fromCharCode(0x109f)}]`;
// Any character outside ASCII: a post that might hold a #tag in another
// script.
const NON_ASCII_SQL = `[^${String.fromCharCode(1)}-${String.fromCharCode(0x7f)}]`;

// Every column the app now converts on write (except usernames).
// maxLength: the column's own limit (varchar), if it has one.
// where: rows that are not shown any more are left alone.
const COLUMNS = [
  { table: 'posts', column: 'content' },
  { table: 'comments', column: 'content' },
  { table: 'messages', column: 'content', where: 'deleted_at IS NULL' },
  { table: 'users', column: 'bio' },
  { table: 'conversations', column: 'name', maxLength: 100 },
  { table: 'communities', column: 'name', maxLength: 100 },
  { table: 'communities', column: 'description' },
  { table: 'pages', column: 'name', maxLength: 100 },
  { table: 'pages', column: 'description' },
  { table: 'reports', column: 'details' },
  { table: 'search_history', column: 'query', maxLength: 100 },
];

function parseArgs(argv) {
  const opts = { apply: false };
  for (const arg of argv) {
    if (arg === '--apply') opts.apply = true;
    else throw new Error(`Unknown option ${arg}. Use --apply.`);
  }
  return opts;
}

// Rows of `table` whose `column` matches the regex `pattern`, BATCH_SIZE at
// a time, in id order.
async function* rowsMatching(db, { table, column, where }, pattern) {
  let lastId = 0;
  for (;;) {
    const { rows } = await db.query(
      `SELECT id, ${column} AS text FROM ${table}
       WHERE id > $1 AND ${column} ~ $2 ${where ? `AND ${where}` : ''}
       ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastId, pattern]
    );
    if (rows.length === 0) return;
    yield rows;
    lastId = rows[rows.length - 1].id;
  }
}

// Writes `next` only if the row still holds `text`. Returns 'converted',
// 'changed' (edited meanwhile) or 'merged' (a recent search that became a
// duplicate of one the person already has: the newer one is kept).
async function writeRow(db, { table, column }, id, text, next) {
  try {
    const { rowCount } = await db.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2 AND ${column} = $3`, [next, id, text]);
    return rowCount ? 'converted' : 'changed';
  } catch (err) {
    if (err.code === '23505' && table === 'search_history') {
      await db.query(
        `UPDATE search_history keep SET searched_at = GREATEST(keep.searched_at, old.searched_at)
         FROM search_history old
         WHERE old.id = $1 AND keep.user_id = old.user_id AND LOWER(keep.query) = LOWER($2) AND keep.id <> old.id`,
        [id, next]
      );
      await db.query('DELETE FROM search_history WHERE id = $1 AND query = $2', [id, text]);
      return 'merged';
    }
    throw err;
  }
}

// Posts whose stored hashtags differ from what their text holds now:
// converted ones, and #tags in other scripts the old parser skipped.
async function staleHashtagPosts(db) {
  const stale = [];
  for await (const rows of rowsMatching(db, { table: 'posts', column: 'content' }, NON_ASCII_SQL)) {
    const ids = rows.filter((r) => r.text.includes('#')).map((r) => r.id);
    if (ids.length === 0) continue;
    const { rows: links } = await db.query(
      `SELECT ph.post_id, h.tag FROM post_hashtags ph JOIN hashtags h ON h.id = ph.hashtag_id WHERE ph.post_id = ANY($1::int[])`,
      [ids]
    );
    for (const row of rows) {
      if (!row.text.includes('#')) continue;
      const stored = links.filter((l) => l.post_id === row.id).map((l) => l.tag.toLowerCase()).sort();
      const now = parseHashtags(row.text).sort();
      if (stored.join('\n') !== now.join('\n')) stale.push(row);
    }
  }
  return stale;
}

// Returns the process exit code. The database is passed in, so a test can
// run it against the test database.
async function run({ argv, db, log = console.log }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    log(err.message);
    return 2;
  }

  let total = 0;
  for (const spec of COLUMNS) {
    const counts = { checked: 0, zawgyi: 0, converted: 0, changed: 0, merged: 0, tooLong: 0 };
    const sample = [];
    const tooLong = [];
    for await (const rows of rowsMatching(db, spec, MYANMAR_SQL)) {
      for (const { id, text } of rows) {
        counts.checked += 1;
        const next = toUnicode(text);
        if (next === text) continue;
        counts.zawgyi += 1;
        if (spec.maxLength && next.length > spec.maxLength) {
          counts.tooLong += 1;
          if (tooLong.length < SAMPLE_SIZE) tooLong.push(id);
          continue;
        }
        if (sample.length < SAMPLE_SIZE) sample.push(id);
        if (opts.apply) counts[await writeRow(db, spec, id, text, next)] += 1;
      }
    }
    const convertible = counts.zawgyi - counts.tooLong;
    total += convertible;
    const name = `${spec.table}.${spec.column}`;
    if (convertible === 0) {
      log(`${name}: ${counts.checked} with Myanmar text, ${counts.zawgyi ? 'none to convert' : 'none in Zawgyi'}`);
    } else {
      const done = opts.apply
        ? `; converted ${counts.converted}${counts.merged ? `, merged ${counts.merged} duplicate searches` : ''}${counts.changed ? `, ${counts.changed} skipped (edited meanwhile)` : ''}`
        : '';
      log(`${name}: ${counts.checked} with Myanmar text, ${convertible} in Zawgyi (ids ${sample.join(', ')}${convertible > sample.length ? ', ...' : ''})${done}`);
    }
    if (counts.tooLong) log(`  ${counts.tooLong} in Zawgyi left as they are: too long for the column once converted (ids ${tooLong.join(', ')})`);
  }

  // After the conversion, so converted posts are indexed with their
  // Unicode tags.
  const stale = await staleHashtagPosts(db);
  if (stale.length > 0) {
    log(`posts with hashtags to index: ${stale.length} (ids ${stale.slice(0, SAMPLE_SIZE).map((r) => r.id).join(', ')}${stale.length > SAMPLE_SIZE ? ', ...' : ''})`);
    if (opts.apply) {
      for (const row of stale) await syncPostHashtags(row.id, row.text);
      log(`  indexed ${stale.length}`);
    }
  } else {
    log('posts with hashtags to index: none');
  }

  if (!opts.apply) {
    log(total || stale.length ? 'Dry run: nothing changed. Run again with --apply to convert.' : 'Nothing to convert.');
  }
  return 0;
}

module.exports = { run, parseArgs, COLUMNS };

if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(2);
  }
  const db = require('../db');
  run({ argv: process.argv.slice(2), db })
    .then((code) => { process.exitCode = code; })
    .catch((err) => { console.error('Zawgyi conversion failed:', err.message || err); process.exitCode = 1; })
    .finally(() => db.end());
}
