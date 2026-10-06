const db = require('../db');
const { sendServerError } = require('../utils/sendError');

// Day 42: recent searches (like Facebook/Instagram), private to their owner.
// One entry per query whatever its case: searching it again moves it to the
// top. Only the newest HISTORY_LIMIT are kept.
const HISTORY_LIMIT = 20;
const MAX_QUERY_LENGTH = 100;

// POST /search/history { query } -- saves a search the person ran.
async function saveSearch(req, res) {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!query) {
      return res.status(400).send('Search query is required');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return res.status(400).send(`A search can be at most ${MAX_QUERY_LENGTH} characters`);
    }
    await db.query(
      `INSERT INTO search_history (user_id, query) VALUES ($1, $2)
       ON CONFLICT (user_id, LOWER(query)) DO UPDATE SET query = EXCLUDED.query, searched_at = now()`,
      [req.userId, query]
    );
    // Keep the newest HISTORY_LIMIT. Ties (same instant) keep the newer row.
    await db.query(
      `DELETE FROM search_history WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM search_history WHERE user_id = $1 ORDER BY searched_at DESC, id DESC LIMIT ${HISTORY_LIMIT}
       )`,
      [req.userId]
    );
    res.status(204).end();
  } catch (err) {
    sendServerError(res, err, 'Saving the search failed. Please try again later.');
  }
}

// GET /search/history -- newest first.
async function getSearchHistory(req, res) {
  try {
    const result = await db.query(
      `SELECT id, query, searched_at FROM search_history WHERE user_id = $1
       ORDER BY searched_at DESC, id DESC LIMIT ${HISTORY_LIMIT}`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err, 'Loading recent searches failed. Please try again later.');
  }
}

// DELETE /search/history/:id -- one entry (only your own: anyone else's is
// "not found", so ids can't be probed).
async function deleteSearch(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).send('Invalid search id');
    }
    const result = await db.query('DELETE FROM search_history WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (result.rowCount === 0) {
      return res.status(404).send('Search not found');
    }
    res.status(204).end();
  } catch (err) {
    sendServerError(res, err, 'Removing the search failed. Please try again later.');
  }
}

// DELETE /search/history -- clears them all.
async function clearSearchHistory(req, res) {
  try {
    await db.query('DELETE FROM search_history WHERE user_id = $1', [req.userId]);
    res.status(204).end();
  } catch (err) {
    sendServerError(res, err, 'Clearing recent searches failed. Please try again later.');
  }
}

module.exports = { saveSearch, getSearchHistory, deleteSearch, clearSearchHistory, HISTORY_LIMIT };
