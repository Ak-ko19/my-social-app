// Day 22: web push notifications (VAPID). Off until the owner sets
// VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (generated locally with
// `npx web-push generate-vapid-keys` -- no account; LATER.md).
//
// A browser that turns push on gives us a PushSubscription: an endpoint URL
// at its push service plus two keys. We store it and later POST encrypted
// messages to that endpoint. The endpoint comes from the client, so the
// server must not POST just anywhere (SSRF): only https endpoints at the
// browsers' known push services are accepted.
const http = require('http');
const https = require('https');
const webpush = require('web-push');
const db = require('../db');
const { notRestrictedSql } = require('./restrictService');
const logger = require('../utils/logger');
const { isProduction } = require('../config/runtime');
const { isOnline } = require('../sockets/presence');
const { pushText } = require('../config/pushText');

// SQL "recipient <col> hasn't turned message notifications off" (Day 23).
// Inlined rather than imported from notificationService, which requires
// this file.
const MESSAGES_ALLOWED = (col) => `NOT EXISTS (SELECT 1 FROM notification_preferences np WHERE np.user_id = ${col} AND np.messages = false)`;

const MAX_PER_USER = 10;
const TTL_SECONDS = 24 * 60 * 60;
// Chrome/Edge/Opera/Samsung (FCM), Firefox, Safari, legacy Edge (WNS).
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];

const isSet = (v) => typeof v === 'string' && v.trim() !== '';

function vapid(env = process.env) {
  if (!isSet(env.VAPID_PUBLIC_KEY) || !isSet(env.VAPID_PRIVATE_KEY)) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY.trim(),
    privateKey: env.VAPID_PRIVATE_KEY.trim(),
    subject: isSet(env.VAPID_SUBJECT) ? env.VAPID_SUBJECT.trim() : 'mailto:admin@example.com'
  };
}

// The browser suites' stub push service (never in production).
function testOrigin() {
  const value = process.env.PUSH_TEST_ENDPOINT_ORIGIN;
  if (!isSet(value) || isProduction()) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isAllowedEndpoint(raw) {
  if (typeof raw !== 'string' || raw.length > 1024) return false;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (testOrigin() && url.origin === testOrigin()) return true;
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// p256dh: a 65-byte uncompressed P-256 point; auth: 16 bytes. Base64url.
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const validKeys = (keys) => keys && typeof keys.p256dh === 'string' && typeof keys.auth === 'string'
  && B64URL.test(keys.p256dh) && B64URL.test(keys.auth)
  && keys.p256dh.length >= 86 && keys.p256dh.length <= 90 && keys.auth.length >= 21 && keys.auth.length <= 26;

// 'ok' | error message.
async function saveSubscription(userId, body, userAgent) {
  const endpoint = body?.endpoint;
  if (!isAllowedEndpoint(endpoint)) return 'That push endpoint is not accepted';
  if (!validKeys(body.keys)) return 'Invalid push subscription keys';
  // Same endpoint = same browser: it now belongs to whoever is logged in.
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4, user_agent = $5, created_at = now()`,
    [userId, endpoint, body.keys.p256dh, body.keys.auth, typeof userAgent === 'string' ? userAgent.slice(0, 300) : null]
  );
  // Keep each person's newest few devices.
  await db.query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${MAX_PER_USER})`,
    [userId]
  );
  return 'ok';
}

async function removeSubscription(userId, endpoint) {
  if (typeof endpoint !== 'string') return;
  await db.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
}

// ---- sending ----
// web-push builds the request (payload encrypted for that browser, signed
// with our VAPID key); we send it. Production endpoints are https only (see
// isAllowedEndpoint) -- plain http is only ever the suites' stub.
function send(subscription, payload, options) {
  const details = webpush.generateRequestDetails(subscription, payload, options);
  const url = new URL(details.endpoint);
  const lib = url.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method: details.method, headers: details.headers, timeout: 10000 }, (res) => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ statusCode: res.statusCode });
        else reject(Object.assign(new Error(`push service answered ${res.statusCode}`), { statusCode: res.statusCode }));
      });
    });
    req.on('timeout', () => req.destroy(new Error('push service timed out')));
    req.on('error', reject);
    req.end(details.body);
  });
}

const deps = { send };
const pending = new Set();

function track(promise) {
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
}

// Tests: wait for the fire-and-forget sends to finish.
async function whenIdle() {
  while (pending.size) await Promise.allSettled([...pending]);
}

async function sendToUser(userId, build) {
  const keys = vapid();
  if (!keys) return;
  const subs = await db.query(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth, u.language
     FROM push_subscriptions ps JOIN users u ON u.id = ps.user_id
     WHERE ps.user_id = $1`,
    [userId]
  );
  if (subs.rows.length === 0) return;
  const payload = JSON.stringify(build(subs.rows[0].language || 'en'));
  await Promise.all(subs.rows.map(async (sub) => {
    try {
      await deps.send(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: TTL_SECONDS, vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey } }
      );
      await db.query('UPDATE push_subscriptions SET last_success_at = now() WHERE id = $1', [sub.id]);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]); // unsubscribed / expired
      } else {
        logger.warn('push send failed', { status: err.statusCode, message: err.message });
      }
    }
  }));
}

function fireAndForget(task) {
  const promise = task().catch((err) => logger.warn('push failed', { message: err.message }));
  track(promise);
}

// After a notification row was created (notificationService / mentions).
function pushNotification({ userId, actorId, type, postId = null, commentId = null, communityId = null, pageId = null, eventId = null }) {
  if (!vapid()) return;
  fireAndForget(async () => {
    const actor = (await db.query('SELECT username FROM users WHERE id = $1', [actorId])).rows[0];
    if (!actor) return;
    // Day 50: group notifications name the group and open it (a request:
    // its Manage screen, where requests are handled). Day 53: the same for
    // a page.
    const group = communityId ? (await db.query('SELECT name FROM communities WHERE id = $1', [communityId])).rows[0] : null;
    if (communityId && !group) return;
    const page = pageId ? (await db.query('SELECT name FROM pages WHERE id = $1', [pageId])).rows[0] : null;
    if (pageId && !page) return;
    // Day 55: and an event's.
    const event = eventId ? (await db.query('SELECT name FROM events WHERE id = $1', [eventId])).rows[0] : null;
    if (eventId && !event) return;
    const key = type === 'mention' ? (commentId ? 'mention_comment' : 'mention_post') : type;
    // Day 45: a scheduled post that couldn't go up is back in the drafts.
    const url = postId ? `/posts/${postId}`
      : communityId ? `/groups/${communityId}${type === 'group_request' ? '/manage' : ''}`
        : pageId ? `/pages/${pageId}`
          : eventId ? `/events/${eventId}`
            : type === 'scheduled_failed' ? '/drafts' : '/notifications';
    await sendToUser(userId, (language) => ({
      title: 'MySocialApp',
      body: pushText(language, key, { name: actor.username, group: group?.name, page: page?.name, event: event?.name }),
      url,
      tag: postId ? `post-${postId}` : communityId ? `group-${communityId}-${type}` : pageId ? `page-${pageId}-${type}`
        : eventId ? `event-${eventId}-${type}` : `notify-${type}-${actorId}`
    }));
  });
}

// After a message was sent: everyone else in the conversation who isn't in
// the app right now (no live socket) -- someone chatting doesn't need a buzz.
function pushNewMessage({ conversationId, senderId }) {
  if (!vapid()) return;
  fireAndForget(async () => {
    const info = (await db.query(
      `SELECT c.type, c.name, s.username AS sender
       FROM conversations c JOIN users s ON s.id = $2 WHERE c.id = $1`,
      [conversationId, senderId]
    )).rows[0];
    if (!info) return;
    const recipients = (await db.query(
      `SELECT cp.user_id FROM conversation_participants cp
       WHERE cp.conversation_id = $1 AND cp.user_id <> $2
         -- Day 23: chat muted, or message notifications off
         AND (cp.muted_until IS NULL OR cp.muted_until <= now())
         AND ${MESSAGES_ALLOWED('cp.user_id')}
         -- Day 47: a restricted sender's messages arrive quietly.
         AND ${notRestrictedSql('cp.user_id', '$2')}
         AND NOT EXISTS (SELECT 1 FROM blocks b
           WHERE (b.blocker_id = cp.user_id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = cp.user_id))`,
      [conversationId, senderId]
    )).rows.map((r) => r.user_id).filter((id) => !isOnline(id));
    const group = info.type === 'group';
    await Promise.all(recipients.map((userId) => sendToUser(userId, (language) => ({
      title: group ? info.name : 'MySocialApp',
      body: group
        ? pushText(language, 'group_message', { name: info.sender, group: info.name })
        : pushText(language, 'message', { name: info.sender }),
      url: `/messages/${conversationId}`,
      tag: `conversation-${conversationId}`
    }))));
  });
}

module.exports = {
  vapid,
  isAllowedEndpoint,
  saveSubscription,
  removeSubscription,
  pushNotification,
  pushNewMessage,
  whenIdle,
  deps,
  MAX_PER_USER
};
