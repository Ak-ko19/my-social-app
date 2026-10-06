// How "popular" a post is: engagement with time decay (Hacker-News-style
// gravity), so a fresh post with some traction outranks an older one with
// slightly more:
//   score = (reactions + 2 * comments) / (hours_old + 2) ^ 1.5
// Comments weigh double -- they take more effort than a tap. Used by
// Explore's popular posts (B7) and a hashtag's Top tab (Day 40), so both
// rank the same way. The arguments are SQL expressions from the caller.
function popularityScoreSql(reactions, comments, createdAt) {
  return `((${reactions}) + 2 * (${comments}))
    / power(EXTRACT(EPOCH FROM (now() - ${createdAt})) / 3600 + 2, 1.5)`;
}

module.exports = { popularityScoreSql };
