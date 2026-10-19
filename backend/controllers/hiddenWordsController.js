// Day 49: Hidden words (Instagram's). What you do with posts and comments
// that contain offensive words -- the built-in English / Arabic list
// (frontend, src/utils/hiddenWords) plus the words you add here: warn
// (covered, "Show anyway"), hide, or off. Only changes what you see.
const db = require('../db');
const { sendError } = require('../utils/httpError');

const MODES = ['off', 'warn', 'hide'];
const MAX_WORDS = 100;
const MAX_LENGTH = 40;

// One form per word, so "Spoiler" and " spoiler " are the same entry.
// Matching folds more than this (Arabic letter forms, stretched letters);
// that happens in the one matcher on the client.
function normalizeWord(raw) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function listWords(userId) {
  const result = await db.query('SELECT word FROM user_hidden_words WHERE user_id = $1 ORDER BY created_at DESC, word', [userId]);
  return result.rows.map((r) => r.word);
}

// GET /hidden-words
async function getHiddenWords(req, res) {
  try {
    const user = await db.query('SELECT hidden_words_mode FROM users WHERE id = $1', [req.userId]);
    if (user.rows.length === 0) return res.status(404).send('User not found');
    res.json({ mode: user.rows[0].hidden_words_mode, words: await listWords(req.userId) });
  } catch (err) {
    sendError(res, err, "Couldn't load your hidden words. Please try again later.");
  }
}

// PUT /hidden-words/mode { mode }
async function setMode(req, res) {
  try {
    const mode = req.body?.mode;
    if (!MODES.includes(mode)) return res.status(400).send(`mode must be one of: ${MODES.join(', ')}`);
    const result = await db.query('UPDATE users SET hidden_words_mode = $1 WHERE id = $2 RETURNING hidden_words_mode', [mode, req.userId]);
    if (result.rows.length === 0) return res.status(404).send('User not found');
    res.json({ mode: result.rows[0].hidden_words_mode });
  } catch (err) {
    sendError(res, err, 'Saving your settings failed. Please try again later.');
  }
}

// POST /hidden-words { word }
async function addWord(req, res) {
  try {
    const word = normalizeWord(req.body?.word);
    if (!word) return res.status(400).send('Enter a word or phrase');
    if ([...word].length > MAX_LENGTH) return res.status(400).send('A hidden word can be at most 40 characters');
    // Count and insert in one statement, so two tabs can't pass 100 together.
    const result = await db.query(
      `INSERT INTO user_hidden_words (user_id, word)
       SELECT $1, $2 WHERE (SELECT COUNT(*) FROM user_hidden_words WHERE user_id = $1) < $3
       ON CONFLICT DO NOTHING RETURNING word`,
      [req.userId, word, MAX_WORDS]
    );
    if (result.rows.length === 0) {
      const existing = await db.query('SELECT 1 FROM user_hidden_words WHERE user_id = $1 AND word = $2', [req.userId, word]);
      if (existing.rows.length === 0) return res.status(400).send('You can hide at most 100 words');
    }
    res.status(201).json({ word, words: await listWords(req.userId) });
  } catch (err) {
    sendError(res, err, 'Saving your settings failed. Please try again later.');
  }
}

// DELETE /hidden-words/:word
async function removeWord(req, res) {
  try {
    await db.query('DELETE FROM user_hidden_words WHERE user_id = $1 AND word = $2', [req.userId, normalizeWord(req.params.word)]);
    res.json({ words: await listWords(req.userId) });
  } catch (err) {
    sendError(res, err, 'Saving your settings failed. Please try again later.');
  }
}

module.exports = { getHiddenWords, setMode, addWord, removeWord, normalizeWord, MODES, MAX_WORDS };
