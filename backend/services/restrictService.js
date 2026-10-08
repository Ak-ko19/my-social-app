// Day 47: restricting a person (migration 056), like Instagram's Restrict.
// Their new comments on your posts wait for your approval (seen only by
// them and you), and they can't send you notifications. They are never
// told -- nothing they can see changes.
const db = require('../db');

// SQL condition: recipient `recipientSql` hasn't restricted `actorSql`.
const notRestrictedSql = (recipientSql, actorSql) =>
  `NOT EXISTS (SELECT 1 FROM user_restrictions r WHERE r.restricter_id = ${recipientSql} AND r.restricted_id = ${actorSql})`;

async function isRestricted(restricterId, restrictedId) {
  const result = await db.query('SELECT 1 FROM user_restrictions WHERE restricter_id = $1 AND restricted_id = $2', [restricterId, restrictedId]);
  return result.rows.length > 0;
}

module.exports = { notRestrictedSql, isRestricted };
