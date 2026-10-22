// Day 28: "Download your information" -- everything this account created
// or owns, as one JSON document (like Facebook's and Instagram's exports).
//
// What it never contains: secrets (password hash, reset and verification
// tokens, session ids, push endpoints and keys, the two-factor key and
// recovery codes), other people's private fields (their email, settings),
// who blocked or reported this account, and conversations this account
// isn't in. Other people appear by username only.
//
// One query per section (no per-row lookups), all filtered by the
// account's own id. Sizes are bounded by what one person creates.
const db = require('../db');
const { getPreferences } = require('./notificationService');

const FORMAT_VERSION = 1;

async function rows(sql, params) {
  return (await db.query(sql, params)).rows;
}

async function buildExport(userId) {
  const [profile] = await rows(
    `SELECT id, username, email, bio, links, avatar_url, cover_url, pinned_post_id, is_private, language, message_permission, comment_permission, hidden_words_mode, email_verified, totp_enabled_at AS two_factor_enabled_at, onboarded_at, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!profile) return null;

  const [
    prefs, posts, media, comments, reactions, commentLikes, bookmarks, stories, storyViews,
    follows, blocked, groups, pagesOwned, pagesFollowed, conversations, participants, messages,
    legacyMessages, notifications, reports, sessions, knownDevices, pushDevices, messageReactions, hiddenSuggestions, searches,
    pollOptions, pollVotes, drafts, collections, muted, restricted, closeFriends, hiddenWords, pagesAdmin, eventsHosted, eventResponses, uploads
  ] = await Promise.all([
    getPreferences(userId),
    rows(`SELECT p.id, p.content, p.visibility, p.image_url, p.created_at,
            c.name AS group_name, pg.name AS page_name
          FROM posts p
          LEFT JOIN communities c ON c.id = p.community_id
          LEFT JOIN pages pg ON pg.id = p.page_id
          WHERE p.user_id = $1 ORDER BY p.created_at, p.id`, [userId]),
    rows(`SELECT pm.post_id, pm.url FROM post_media pm JOIN posts p ON p.id = pm.post_id
          WHERE p.user_id = $1 ORDER BY pm.post_id, pm.position`, [userId]),
    rows(`SELECT id, post_id, parent_comment_id, content, created_at
          FROM comments WHERE user_id = $1 ORDER BY created_at, id`, [userId]),
    rows(`SELECT post_id, reaction, created_at FROM likes WHERE user_id = $1 ORDER BY created_at`, [userId]),
    rows(`SELECT comment_id, created_at FROM comment_likes WHERE user_id = $1 ORDER BY created_at`, [userId]),
    rows(`SELECT post_id, created_at FROM bookmarks WHERE user_id = $1 ORDER BY created_at`, [userId]),
    rows(`SELECT id, media_url, created_at, expires_at, close_friends FROM stories WHERE user_id = $1 ORDER BY created_at`, [userId]),
    // A count, not names: the app never shows a story's owner who viewed it.
    rows(`SELECT sv.story_id, COUNT(*)::int AS views FROM story_views sv
          JOIN stories s ON s.id = sv.story_id
          WHERE s.user_id = $1 GROUP BY sv.story_id`, [userId]),
    rows(`SELECT f.follower_id = $1 AS i_follow, u.username, f.status, f.created_at FROM follows f
          JOIN users u ON u.id = CASE WHEN f.follower_id = $1 THEN f.following_id ELSE f.follower_id END
          WHERE f.follower_id = $1 OR f.following_id = $1 ORDER BY f.created_at`, [userId]),
    rows(`SELECT u.username, b.created_at FROM blocks b JOIN users u ON u.id = b.blocked_id
          WHERE b.blocker_id = $1 ORDER BY b.created_at`, [userId]),
    rows(`SELECT c.id, c.name, cm.role, cm.status, cm.joined_at, c.created_by = $1 AS created_by_me
          FROM community_members cm JOIN communities c ON c.id = cm.community_id
          WHERE cm.user_id = $1 ORDER BY cm.joined_at`, [userId]),
    rows(`SELECT id, name, category, description, created_at FROM pages WHERE owner_id = $1 ORDER BY created_at`, [userId]),
    rows(`SELECT pg.id, pg.name, pf.created_at FROM page_follows pf JOIN pages pg ON pg.id = pf.page_id
          WHERE pf.user_id = $1 ORDER BY pf.created_at`, [userId]),
    rows(`SELECT c.id, c.type, c.name, c.avatar_url, c.created_at, cp.joined_at FROM conversation_participants cp
          JOIN conversations c ON c.id = cp.conversation_id
          WHERE cp.user_id = $1 ORDER BY c.id`, [userId]),
    rows(`SELECT other.conversation_id, u.username FROM conversation_participants mine
          JOIN conversation_participants other ON other.conversation_id = mine.conversation_id
          JOIN users u ON u.id = other.user_id
          WHERE mine.user_id = $1 ORDER BY other.conversation_id, u.username`, [userId]),
    rows(`SELECT m.conversation_id, m.id, u.username AS sender, m.type, m.content, m.media_url,
            m.duration_seconds, m.reply_to_message_id, m.is_forwarded, m.created_at, m.edited_at, m.deleted_at
          FROM messages m
          JOIN conversation_participants mine ON mine.conversation_id = m.conversation_id AND mine.user_id = $1
          JOIN users u ON u.id = m.sender_id
          ORDER BY m.conversation_id, m.created_at, m.id`, [userId]),
    rows(`SELECT s.username AS sender, r.username AS receiver, l.content, l.created_at
          FROM messages_dm_legacy l JOIN users s ON s.id = l.sender_id JOIN users r ON r.id = l.receiver_id
          WHERE l.sender_id = $1 OR l.receiver_id = $1 ORDER BY l.created_at`, [userId]),
    rows(`SELECT n.type, a.username AS from_user, n.post_id, n.comment_id, n.community_id AS group_id, n.page_id, n.event_id, n.device, n.is_read, n.created_at
          FROM notifications n JOIN users a ON a.id = n.actor_id
          WHERE n.user_id = $1 ORDER BY n.created_at`, [userId]),
    rows(`SELECT target_type, target_id, reason, details, status, created_at
          FROM reports WHERE reporter_id = $1 ORDER BY created_at`, [userId]),
    rows(`SELECT user_agent, created_at, last_seen_at, expires_at, revoked_at
          FROM sessions WHERE user_id = $1 ORDER BY created_at`, [userId]),
    // Day 77: the kinds of device you logged in from (for new-login alerts).
    rows(`SELECT device_key, last_seen_at FROM known_devices WHERE user_id = $1 ORDER BY last_seen_at DESC`, [userId]),
    rows(`SELECT user_agent, created_at, last_success_at FROM push_subscriptions
          WHERE user_id = $1 ORDER BY created_at`, [userId]),
    // Day 31: reactions to messages, in chats the account is still in.
    rows(`SELECT m.conversation_id, mr.message_id, mr.reaction, mr.created_at FROM message_reactions mr
          JOIN messages m ON m.id = mr.message_id
          JOIN conversation_participants mine ON mine.conversation_id = m.conversation_id AND mine.user_id = $1
          WHERE mr.user_id = $1 ORDER BY mr.created_at`, [userId]),
    // Day 39: people you hid from your suggestions.
    rows(`SELECT u.username, sd.created_at FROM suggestion_dismissals sd JOIN users u ON u.id = sd.dismissed_user_id
          WHERE sd.user_id = $1 ORDER BY sd.created_at`, [userId]),
    // Day 42: recent searches.
    rows(`SELECT query, searched_at FROM search_history WHERE user_id = $1 ORDER BY searched_at DESC`, [userId]),
    // Day 44: the polls in your posts (with their counts, which you see
    // as their author), and your votes in anyone's polls.
    rows(`SELECT o.post_id, o.label, pl.closes_at,
            (SELECT COUNT(*)::int FROM poll_votes v WHERE v.option_id = o.id) AS votes
          FROM poll_options o JOIN polls pl ON pl.post_id = o.post_id JOIN posts p ON p.id = o.post_id
          WHERE p.user_id = $1 ORDER BY o.post_id, o.position`, [userId]),
    rows(`SELECT v.post_id, o.label AS option, v.created_at AS voted_at
          FROM poll_votes v JOIN poll_options o ON o.id = v.option_id
          WHERE v.user_id = $1 ORDER BY v.created_at`, [userId]),
    // Day 45: drafts and scheduled posts.
    rows(`SELECT content, visibility, community_id, page_id, poll, media_urls AS media, scheduled_for, created_at, updated_at
          FROM post_drafts WHERE user_id = $1 ORDER BY created_at`, [userId]),
    // Day 46: saved collections and which saved posts are in each.
    rows(`SELECT c.name, c.created_at,
            COALESCE(array_agg(b.post_id ORDER BY i.added_at) FILTER (WHERE b.post_id IS NOT NULL), '{}') AS post_ids
          FROM bookmark_collections c
          LEFT JOIN bookmark_collection_items i ON i.collection_id = c.id
          LEFT JOIN bookmarks b ON b.id = i.bookmark_id
          WHERE c.user_id = $1 GROUP BY c.id ORDER BY c.created_at`, [userId]),
    // Day 47: people you muted.
    rows(`SELECT u.username, m.created_at FROM user_mutes m JOIN users u ON u.id = m.muted_id
          WHERE m.muter_id = $1 ORDER BY m.created_at`, [userId]),
    rows(`SELECT u.username, r.created_at FROM user_restrictions r JOIN users u ON u.id = r.restricted_id
          WHERE r.restricter_id = $1 ORDER BY r.created_at`, [userId]),
    rows(`SELECT u.username, cf.created_at FROM close_friends cf JOIN users u ON u.id = cf.friend_id
          WHERE cf.user_id = $1 ORDER BY cf.created_at`, [userId]),
    // Day 49: your hidden words.
    rows('SELECT word, created_at FROM user_hidden_words WHERE user_id = $1 ORDER BY created_at', [userId]),
    // Day 53: pages you're an admin of.
    rows(`SELECT p.id, p.name, pa.created_at AS since FROM page_admins pa JOIN pages p ON p.id = pa.page_id
          WHERE pa.user_id = $1 ORDER BY pa.created_at`, [userId]),
    // Day 55: events you host, and your answers to events.
    rows(`SELECT id, name, description, starts_at, ends_at, location, audience, cancelled_at, created_at
          FROM events WHERE host_id = $1 ORDER BY created_at`, [userId]),
    rows(`SELECT r.event_id, e.name, r.status, r.created_at FROM event_responses r JOIN events e ON e.id = r.event_id
          WHERE r.user_id = $1 ORDER BY r.created_at`, [userId]),
    // Day 57: what you uploaded lately (kept 30 days, for the daily limit).
    rows('SELECT kind, bytes, created_at FROM media_uploads WHERE user_id = $1 ORDER BY created_at', [userId])
  ]);

  const groupBy = (list, key) => list.reduce((map, row) => {
    (map[row[key]] ||= []).push(row);
    return map;
  }, {});
  const mediaByPost = groupBy(media, 'post_id');
  const pollByPost = groupBy(pollOptions, 'post_id');
  const viewsByStory = groupBy(storyViews, 'story_id');
  const peopleByConversation = groupBy(participants, 'conversation_id');
  const messagesByConversation = groupBy(messages, 'conversation_id');
  const followRows = (iFollow, status) => follows
    .filter((f) => f.i_follow === iFollow && f.status === status)
    .map(({ username, created_at }) => ({ username, since: created_at }));

  return {
    format: 'mysocialapp-data-export',
    version: FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    profile,
    settings: {
      private_account: profile.is_private,
      language: profile.language,
      // Day 47.
      who_can_message_you: profile.message_permission,
      who_can_comment_on_your_posts: profile.comment_permission,
      // Day 49.
      hidden_words: { mode: profile.hidden_words_mode, words: hiddenWords },
      notifications: prefs
    },
    posts: posts.map((p) => ({
      ...p,
      media: (mediaByPost[p.id] || []).map((m) => m.url),
      poll: pollByPost[p.id]
        ? { closes_at: pollByPost[p.id][0].closes_at, options: pollByPost[p.id].map(({ label, votes }) => ({ label, votes })) }
        : null
    })),
    comments,
    reactions,
    comment_likes: commentLikes,
    saved_posts: bookmarks,
    saved_collections: collections,
    stories: stories.map((s) => ({
      ...s,
      views: viewsByStory[s.id]?.[0].views || 0
    })),
    connections: {
      following: followRows(true, 'accepted'),
      followers: followRows(false, 'accepted'),
      follow_requests_sent: followRows(true, 'pending'),
      follow_requests_received: followRows(false, 'pending'),
      blocked_users: blocked,
      muted_users: muted,
      restricted_users: restricted,
      close_friends: closeFriends
    },
    groups,
    pages: { owned: pagesOwned, admin_of: pagesAdmin, followed: pagesFollowed },
    events: { hosted: eventsHosted, responses: eventResponses },
    recent_uploads: uploads,
    conversations: conversations.map((c) => ({
      ...c,
      participants: (peopleByConversation[c.id] || []).map((p) => p.username),
      // A deleted message stays as a marker (it was there), never its content.
      messages: (messagesByConversation[c.id] || []).map(({ conversation_id: _c, deleted_at, content, media_url, duration_seconds, ...m }) => (
        deleted_at ? { ...m, deleted_at } : { ...m, content, media_url, duration_seconds }
      ))
    })),
    message_reactions: messageReactions,
    hidden_suggestions: hiddenSuggestions,
    recent_searches: searches,
    poll_votes: pollVotes,
    drafts_and_scheduled_posts: drafts,
    older_direct_messages: legacyMessages,
    notifications,
    reports_you_made: reports,
    login_sessions: sessions,
    known_login_devices: knownDevices,
    push_notification_devices: pushDevices
  };
}

module.exports = { buildExport, FORMAT_VERSION };
