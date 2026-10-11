// Day 53: who may manage a page -- its owner (pages.owner_id) or one of
// its admins (page_admins). Managers edit the page, post as it and edit /
// delete its posts; only the owner deletes the page and chooses admins.
const db = require('../db');

const MAX_ADMINS = 20;

// SQL: "user <userSql> manages page <pageSql>".
const managesPageSql = (pageSql, userSql) => `(
  EXISTS (SELECT 1 FROM pages mp WHERE mp.id = ${pageSql} AND mp.owner_id = ${userSql})
  OR EXISTS (SELECT 1 FROM page_admins pa WHERE pa.page_id = ${pageSql} AND pa.user_id = ${userSql})
)`;

async function managesPage(pageId, userId) {
  if (!pageId || !userId) return false;
  const result = await db.query(`SELECT ${managesPageSql('$1::int', '$2::int')} AS ok`, [pageId, userId]);
  return result.rows[0].ok;
}

module.exports = { managesPage, managesPageSql, MAX_ADMINS };
