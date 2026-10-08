// Day 47: muting a person (migration 055). Their posts and stories leave
// your Home feed, stories tray and Explore; everything else (their
// profile, search, links, groups, comments, notifications) is unchanged,
// and they are never told -- like Facebook's snooze / Instagram's mute.
const db = require('../db');

// SQL condition: the author `authorSql` isn't muted by viewer `viewerSql`.
// A page's posts (pageSql not null) belong to the page, not to the person
// running it, so muting the person doesn't hide them.
function notMutedSql(viewerSql, authorSql, pageSql = null) {
  const notMuted = `NOT EXISTS (SELECT 1 FROM user_mutes m WHERE m.muter_id = ${viewerSql} AND m.muted_id = ${authorSql})`;
  return pageSql ? `(${pageSql} IS NOT NULL OR ${notMuted})` : notMuted;
}

async function isMuted(muterId, mutedId) {
  const result = await db.query('SELECT 1 FROM user_mutes WHERE muter_id = $1 AND muted_id = $2', [muterId, mutedId]);
  return result.rows.length > 0;
}

module.exports = { notMutedSql, isMuted };
