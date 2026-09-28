const nodemailer = require('nodemailer');

// Single "send an email" choke point: every caller (signup and resend
// verification, forgot password) goes through sendEmail(). The provider is
// picked from the environment on every call:
//   1. BREVO_API_KEY set -> Brevo's HTTPS API. Production: Render's free
//      tier blocks outbound SMTP, so an HTTP API is the only way out.
//   2. EMAIL_HOST/EMAIL_USER/EMAIL_PASS set -> SMTP via Nodemailer (local
//      dev, e.g. Gmail + an App Password).
//   3. Neither -> not configured: nothing is sent (see sendEmail).
// See backend/.env.example.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 10000;

function emailProvider(env = process.env) {
  if (env.BREVO_API_KEY) return 'brevo';
  if (env.EMAIL_HOST && env.EMAIL_USER && env.EMAIL_PASS) return 'smtp';
  return null;
}

// "MySocialApp <hello@example.com>" or "hello@example.com" -> { name, email },
// or null if it isn't an address.
function parseSender(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(?:(.*?)\s*<([^<>\s]+@[^<>\s]+)>|([^<>\s]+@[^<>\s]+))$/);
  if (!match) return null;
  const name = (match[1] || '').replace(/^"|"$/g, '').trim();
  return { email: match[2] || match[3], ...(name ? { name } : {}) };
}

async function sendWithBrevo({ to, subject, text }) {
  const sender = parseSender(process.env.EMAIL_FROM);
  if (!sender) {
    console.error('[email] Brevo: EMAIL_FROM must be a sender address verified in Brevo, e.g. "MySocialApp <hello@example.com>".');
    return false;
  }
  let res;
  try {
    res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (err) {
    console.error(`[email] Brevo request failed (${err.name === 'TimeoutError' ? 'timed out' : err.message}); email to ${to} not sent.`);
    return false;
  }
  if (res.status === 201 || res.status === 202) return true;
  // Brevo answers errors as { code, message }; neither contains the key.
  const body = await res.json().catch(() => ({}));
  console.error(`[email] Brevo refused the email to ${to}: HTTP ${res.status} ${body.code || ''} ${body.message || ''}`.trim());
  return false;
}

let smtp = null; // { key, transporter }, rebuilt if the settings change
async function sendWithSmtp({ to, subject, text }) {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  const key = [EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS].join('\n');
  if (!smtp || smtp.key !== key) {
    smtp = {
      key,
      transporter: nodemailer.createTransport({
        host: EMAIL_HOST,
        port: Number(EMAIL_PORT) || 587,
        secure: Number(EMAIL_PORT) === 465,
        auth: { user: EMAIL_USER, pass: EMAIL_PASS }
      })
    };
  }
  try {
    await smtp.transporter.sendMail({ from: process.env.EMAIL_FROM || EMAIL_USER, to, subject, text });
    return true;
  } catch (err) {
    console.error(`[email] SMTP failed to send to ${to}: ${err.message}`);
    return false;
  }
}

// Returns true if a provider accepted the email. Never throws: a provider
// problem shouldn't fail the signup or forgot-password request itself.
async function sendEmail({ to, subject, text }) {
  const provider = emailProvider();
  if (provider === 'brevo') return sendWithBrevo({ to, subject, text });
  if (provider === 'smtp') return sendWithSmtp({ to, subject, text });
  console.log(`[email] (no email provider configured -- logging instead) To: ${to} | Subject: ${subject}\n${text}`);
  return false;
}

module.exports = { sendEmail, emailProvider, parseSender };
