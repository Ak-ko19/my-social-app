// Day 67: the API spec -- sign up, log in, passwords, email verification,
// the account itself, and sessions (one per login).
const { s, ref, body, json, text, op } = require('../helpers');

const PASSWORD = s.str('8 to 72 characters', { minLength: 8, maxLength: 72 });
const BOT_FIELDS = {
  formToken: s.str('From GET /form-token (signup: at least 3 seconds old)'),
  turnstileToken: s.str('The Cloudflare Turnstile answer, when GET /config gives a turnstileSiteKey'),
  website: s.str('A honeypot: leave it out or empty -- a filled one is refused')
};
const PASSWORD_ONLY = body({ password: s.str('Your current password') }, { required: ['password'] });
// Day 77: two-factor authentication.
const TOTP_CODE = s.str('The 6-digit code the authenticator app shows now (spaces are fine)');
const RECOVERY_CODE = s.str('One of the recovery codes ("abcde-fghij"), instead of a code from the app; each works once');
const TWO_FACTOR_ATTEMPTS = 'after more than 10 wrong codes in 15 minutes, codes are refused (429) until the 15 minutes are up.';

module.exports = {
  'POST /signup': op({
    tag: 'Auth', auth: 'public', limited: true,
    summary: 'Create an account',
    description: 'Sends a verification email when email is on (GET /config). The new account must then log in. Rate limits: '
      + 'per network per 15 minutes and per day.',
    requestBody: body({
      username: s.str('Unique'),
      email: s.str('Unique', { format: 'email' }),
      password: PASSWORD,
      language: s.enum(['en', 'ar'], 'The app language at signup, so it follows the account to other devices; anything else is ignored'),
      ...BOT_FIELDS
    }, { required: ['username', 'email', 'password', 'formToken'] }),
    responses: {
      201: json(ref('NewAccount'), 'Created'),
      400: text('A missing field, an invalid email or password length, a taken email or username, or a failed bot check')
    }
  }),
  'POST /login': op({
    tag: 'Auth', auth: 'public', limited: true,
    summary: 'Log in: a token for a new session',
    description: 'Logging in to a deactivated account reactivates it. After several wrong passwords for one email, further attempts '
      + 'are slowed and then refused for a while (429). With two-factor authentication on, a right password answers with a '
      + 'challenge instead of a session: send it with a code to POST /login/2fa.',
    requestBody: body({
      email: s.str(),
      password: s.str(),
      website: BOT_FIELDS.website
    }, { required: ['email', 'password'] }),
    responses: {
      200: json({ oneOf: [ref('LoginResult'), ref('TwoFactorChallenge')] }, 'Logged in, or (2FA on) a code is needed next'),
      400: text('Email and password are required (or the honeypot was filled)'),
      401: text('Invalid email or password'),
      403: {
        description: 'Banned (text), or suspended (JSON with the end time)',
        content: {
          'text/plain': { schema: { type: 'string' } },
          'application/json': { schema: ref('Suspended') }
        }
      }
    }
  }),
  'POST /login/2fa': op({
    tag: 'Auth', auth: 'public', limited: true,
    summary: "Log in, step two: the authenticator app's code (or a recovery code)",
    description: 'Finishes a login that POST /login answered with twoFactorRequired. The challenge is good for 5 minutes and one login, and ends '
      + `if the password changes or 2FA is turned off. Each code works once; ${TWO_FACTOR_ATTEMPTS}`,
    requestBody: body({
      challengeToken: s.str('From POST /login'),
      code: TOTP_CODE,
      recoveryCode: RECOVERY_CODE
    }, { required: ['challengeToken'] }),
    responses: {
      200: json(ref('LoginResult'), 'Logged in (after a recovery code, with recoveryCodesLeft)'),
      400: text('Your login has expired. Please log in again. (also a challenge already used for a login) / no code / a wrong or used code'),
      403: {
        description: 'Banned (text), or suspended (JSON with the end time)',
        content: {
          'text/plain': { schema: { type: 'string' } },
          'application/json': { schema: ref('Suspended') }
        }
      },
      429: text('Too many wrong codes, or too many attempts from this network')
    }
  }),
  'POST /forgot-password': op({
    tag: 'Auth', auth: 'public', limited: true,
    summary: 'Email a password-reset link',
    description: 'Always the same answer whether or not the email has an account, so it cannot be used to find accounts. Limits per '
      + 'network and per email address.',
    requestBody: body({ email: s.str(), ...BOT_FIELDS }, { required: ['email', 'formToken'] }),
    responses: {
      200: text('If that email has an account, a link is on its way'),
      400: text('Email is required, or a failed bot check'),
      503: text('Password reset by email is not available right now (no email provider configured)')
    }
  }),
  'POST /reset-password/:token': op({
    tag: 'Auth', auth: 'public', limited: true,
    summary: 'Set a new password with the emailed link',
    description: 'Signs the account out everywhere.',
    pathParams: { token: s.str('The token from the emailed link') },
    requestBody: body({ password: PASSWORD }, { required: ['password'] }),
    responses: {
      200: text('Password reset successfully'),
      400: text('New password is required / wrong length / Link expired or invalid')
    }
  }),
  'GET /verify-email/:token': op({
    tag: 'Auth', auth: 'public',
    summary: 'Verify the email address with the emailed link',
    pathParams: { token: s.str('The token from the emailed link') },
    responses: { 200: text('Email verified successfully'), 400: text('Link expired or invalid') }
  }),
  'POST /resend-verification': op({
    tag: 'Auth', auth: 'user', limited: true,
    summary: 'Send the verification email again',
    responses: {
      200: text('Verification email sent'),
      400: text('Your email is already verified'),
      404: text('User not found'),
      503: text('Email verification is not available right now')
    }
  }),
  'PUT /profile/password': op({
    tag: 'Account', auth: 'user', limited: true,
    summary: 'Change your password',
    description: 'Every other session is signed out (and its live connections closed); this one stays signed in.',
    requestBody: body({ currentPassword: s.str(), newPassword: PASSWORD }, { required: ['currentPassword', 'newPassword'] }),
    responses: {
      200: json(ref('PasswordChanged'), 'Changed'),
      400: text('Current and new password are required / wrong length'),
      403: text('Current password is incorrect'),
      404: text('User not found')
    }
  }),
  'POST /profile/deactivate': op({
    tag: 'Account', auth: 'user', limited: true,
    summary: 'Deactivate your account (hidden until you log in again)',
    requestBody: PASSWORD_ONLY,
    responses: {
      200: text('Account deactivated'),
      400: text('Password is required to deactivate your account'),
      403: text('Incorrect password'),
      404: text('User not found')
    }
  }),
  'DELETE /profile': op({
    tag: 'Account', auth: 'user', limited: true,
    summary: 'Delete your account and everything in it, for good',
    description: 'Posts, comments, messages, uploaded files and the rest are deleted; this cannot be undone.',
    requestBody: PASSWORD_ONLY,
    responses: {
      200: text('Account deleted'),
      400: text('Password is required to delete your account'),
      403: text('Incorrect password'),
      404: text('User not found')
    }
  }),
  'GET /sessions': op({
    tag: 'Sessions', auth: 'user',
    summary: "Where you're logged in",
    description: 'Active sessions, this one first, then by last activity (at most 50).',
    responses: { 200: json(s.object({ sessions: s.array(ref('Session')) }), 'Your sessions') }
  }),
  'POST /sessions/revoke-others': op({
    tag: 'Sessions', auth: 'user',
    summary: 'Log out of every other device',
    responses: { 200: json(s.object({ revoked: s.int('How many sessions were signed out') }), 'Done') }
  }),
  'DELETE /sessions/:id': op({
    tag: 'Sessions', auth: 'user',
    summary: 'Log out one session',
    pathParams: { id: s.str('The session id (UUID)') },
    responses: {
      200: json(s.object({ current: s.bool('true: it was this session, so this token no longer works') }), 'Signed out'),
      404: text('Session not found')
    }
  }),
  'GET /2fa': op({
    tag: 'Two-factor', auth: 'user',
    summary: 'Whether two-factor authentication is on',
    responses: { 200: json(ref('TwoFactorStatus'), 'Status'), 404: text('User not found') }
  }),
  'POST /2fa/setup': op({
    tag: 'Two-factor', auth: 'user', limited: true,
    summary: 'Start setting up an authenticator app: a new key and its QR code',
    description: 'Nothing is turned on yet: POST /2fa/enable with a code from the app finishes it. Starting again replaces the '
      + 'unfinished key. The key is only ever sent here.',
    requestBody: PASSWORD_ONLY,
    responses: {
      200: json(ref('TwoFactorSetup'), 'Scan the QR code, or type the key into the app'),
      400: text('Password is required.'),
      403: text('Incorrect password'),
      409: text('Two-factor authentication is already on.')
    }
  }),
  'POST /2fa/enable': op({
    tag: 'Two-factor', auth: 'user', limited: true,
    summary: 'Turn two-factor authentication on with a code from the app',
    description: 'Answers with 10 one-time recovery codes, shown this once. An email tells the owner (when email is on); '
      + `${TWO_FACTOR_ATTEMPTS}`,
    requestBody: body({ code: TOTP_CODE }, { required: ['code'] }),
    responses: {
      200: json(ref('RecoveryCodes'), 'On'),
      400: text('No code / a wrong code / Set up two-factor authentication first.'),
      409: text('Two-factor authentication is already on.'),
      429: text('Too many wrong codes, or too many attempts')
    }
  }),
  'POST /2fa/disable': op({
    tag: 'Two-factor', auth: 'user', limited: true,
    summary: 'Turn two-factor authentication off',
    description: 'Needs the password and a code from the app or a recovery code. The recovery codes are deleted. An email tells '
      + `the owner (when email is on); ${TWO_FACTOR_ATTEMPTS}`,
    requestBody: body({
      password: s.str('Your current password'),
      code: TOTP_CODE,
      recoveryCode: RECOVERY_CODE
    }, { required: ['password'] }),
    responses: {
      200: json(ref('Ok'), 'Off'),
      400: text('Password is required / no code / a wrong or used code / Two-factor authentication is off.'),
      403: text('Incorrect password'),
      429: text('Too many wrong codes, or too many attempts')
    }
  }),
  'POST /2fa/recovery-codes': op({
    tag: 'Two-factor', auth: 'user', limited: true,
    summary: 'New recovery codes (the old ones stop working)',
    requestBody: PASSWORD_ONLY,
    responses: {
      200: json(ref('RecoveryCodes'), 'New codes, shown this once'),
      400: text('Password is required. / Two-factor authentication is off.'),
      403: text('Incorrect password')
    }
  }),
  'POST /logout': op({
    tag: 'Sessions', auth: 'user',
    summary: 'Log out this session',
    responses: { 200: json(ref('Ok'), 'Logged out') }
  })
};
