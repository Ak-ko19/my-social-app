// Escapes LIKE/ILIKE wildcards in user input, so a search for "%" or "_"
// finds that character instead of matching everything. (Backslash is
// Postgres's default LIKE escape character.)
function escapeLike(text) {
  return text.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

module.exports = { escapeLike };
