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
      + 'are slowed and then refused for a while (429).',
    requestBody: body({
      email: s.str(),
      password: s.str(),
      website: BOT_FIELDS.website
    }, { required: ['email', 'password'] }),
    responses: {
      200: json(ref('LoginResult'), 'Logged in'),
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
  'POST /logout': op({
    tag: 'Sessions', auth: 'user',
    summary: 'Log out this session',
    responses: { 200: json(ref('Ok'), 'Logged out') }
  })
};
