// Day 77: "New login" alerts. After a successful login, if the account has
// logged in before but never (in the last KNOWN_FOR) from this kind of
// device -- browser, system and phone/desktop, as the Sessions screen shows
// it; no IP addresses are kept -- the owner gets a notification, a push
// and, when email is set up, an email. An account's very first device is
// just remembered. Like Facebook's alerts, this can't tell a stranger from
// you on a new phone; it makes sure you hear about it either way.
const db = require('../db');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');
const { describeDevice } = require('./sessionService');
const email = require('../utils/email'); // called through the module, so tests can watch it
const { emailText } = require('../config/emailText');
const { deviceText } = require('../config/pushText');

const KNOWN_FOR = '180 days'; // also the cleanup job's retention (cleanupService)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const deviceKey = ({ browser, os, kind }) => `${browser || '?'}|${os || '?'}|${kind}`.slice(0, 100);

// Returns true when an alert went out. Never throws: a failed alert must
// not fail the login it is about (it is logged instead).
async function afterLogin(userId, userAgent) {
  try {
    const device = describeDevice(userAgent);
    const key = deviceKey(device);
    const known = (await db.query(
      `SELECT device_key FROM known_devices WHERE user_id = $1 AND last_seen_at > now() - interval '${KNOWN_FOR}'`,
      [userId]
    )).rows.map((r) => r.device_key);
    await db.query(
      `INSERT INTO known_devices (user_id, device_key) VALUES ($1, $2)
       ON CONFLICT (user_id, device_key) DO UPDATE SET last_seen_at = now()`,
      [userId, key]
    );
    if (known.length === 0 || known.includes(key)) return false;

    await notificationService.notifySystem({ userId, type: 'new_login', device });
    if (email.emailEnabled()) {
      const user = (await db.query('SELECT email, language FROM users WHERE id = $1', [userId])).rows[0];
      if (user) {
        const time = new Date().toISOString().slice(0, 16).replace('T', ' ');
        // Not awaited: a slow mail provider mustn't hold up the login.
        email.sendEmail({
          to: user.email,
          ...emailText(user.language, 'newLogin', { device: deviceText(user.language, device), time, link: `${FRONTEND_URL}/settings/sessions` })
        }).catch((err) => logger.error('login alert email failed', { userId, err }));
      }
    }
    return true;
  } catch (err) {
    logger.error('login alert failed', { userId, err });
    return false;
  }
}

module.exports = { afterLogin, deviceKey, KNOWN_FOR };
