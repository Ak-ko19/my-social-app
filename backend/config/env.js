// Startup check of the environment, so a missing or malformed setting stops
// the server with a clear message instead of failing later in confusing
// ways (e.g. no JWT_SECRET used to turn every login into a 500).
//
// On Render a deploy whose process exits at startup is marked failed and
// the previous version keeps serving, so refusing to start is safe there.
//
// Messages name the variable and never include a secret's value (only
// ALLOWED_ORIGINS entries, which are public URLs, are quoted back).
const { resolveTrustProxy } = require('./trustProxy');
const { isProduction } = require('./runtime');
const { parseSender } = require('../utils/email');

const isSet = (value) => typeof value === 'string' && value.trim() !== '';

// A bare origin as browsers send it: scheme + host (+ port), nothing else.
// "https://app.example.com/" (trailing slash) never matches a browser's
// Origin header, which fails CORS without any error on the server.
function isOrigin(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

function checkEnv(env) {
  const errors = [];
  const warnings = [];
  const production = isProduction(env);

  if (!isSet(env.DATABASE_URL)) {
    errors.push('DATABASE_URL is not set. Set it to your PostgreSQL connection string (postgresql://...).');
  } else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL.trim())) {
    errors.push('DATABASE_URL must start with postgresql:// or postgres://.');
  }

  if (!isSet(env.JWT_SECRET)) {
    errors.push('JWT_SECRET is not set. Set it to a long random string (e.g. 64 hex characters).');
  } else if (production && env.JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET is shorter than 32 characters. Use a long random value; changing it signs everyone out.');
  }

  if (isSet(env.PORT)) {
    const port = env.PORT.trim();
    if (!/^\d+$/.test(port) || Number(port) > 65535) {
      errors.push('PORT must be a whole number from 0 to 65535.');
    }
  }

  try {
    resolveTrustProxy(env);
  } catch (err) {
    errors.push(err.message);
  }

  if (isSet(env.ALLOWED_ORIGINS)) {
    // Empty entries (a stray comma) are harmless, so they're skipped.
    const bad = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter((o) => o && !isOrigin(o));
    if (bad.length > 0) {
      errors.push(
        `ALLOWED_ORIGINS has invalid entries: ${bad.map((o) => `"${o}"`).join(', ')}. `
        + 'Use comma-separated origins like https://app.example.com (no path, no trailing slash).'
      );
    }
  } else if (production) {
    errors.push("ALLOWED_ORIGINS is not set. Set it to the frontend's URL (e.g. https://your-app.vercel.app), or browsers can't call the API.");
  }

  if (isSet(env.FRONTEND_URL)) {
    if (!isOrigin(env.FRONTEND_URL.trim())) {
      errors.push('FRONTEND_URL must be the frontend origin, like https://app.example.com (no path, no trailing slash).');
    }
  } else if (production) {
    errors.push("FRONTEND_URL is not set. Set it to the frontend's URL; email verification and password reset links point there.");
  }

  const cloudinary = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const cloudinarySet = cloudinary.filter((name) => isSet(env[name]));
  if (cloudinarySet.length > 0 && cloudinarySet.length < cloudinary.length) {
    const missing = cloudinary.filter((name) => !isSet(env[name]));
    warnings.push(`Cloudinary is only partly configured (missing ${missing.join(', ')}). Image and voice uploads will fail.`);
  } else if (cloudinarySet.length === 0 && production) {
    warnings.push('Cloudinary is not configured. Image and voice uploads will fail.');
  }

  // Day 10: optional Sentry. A DSN looks like https://<key>@<host>/<project>.
  if (isSet(env.SENTRY_DSN) && !/^https:\/\/[^@\s]+@[^/\s]+\/\S+$/.test(env.SENTRY_DSN.trim())) {
    warnings.push('SENTRY_DSN does not look like a Sentry DSN (https://<key>@<host>/<project>), so Sentry may not receive errors.');
  }

  // Day 9: the daily cleanup job's shared secret (POST /internal/cleanup).
  if (isSet(env.CLEANUP_SECRET)) {
    if (env.CLEANUP_SECRET.length < 32) {
      errors.push('CLEANUP_SECRET must be at least 32 characters (a long random value, e.g. 64 hex characters).');
    }
  } else if (production) {
    warnings.push('CLEANUP_SECRET is not set, so the daily cleanup job is off (expired stories and old notifications pile up).');
  }

  if (isSet(env.BREVO_API_KEY) && !parseSender(env.EMAIL_FROM)) {
    warnings.push('BREVO_API_KEY is set but EMAIL_FROM is not a sender address (e.g. "MySocialApp <hello@example.com>", verified in Brevo), so no emails will be sent.');
  }

  const email = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'];
  const emailSet = email.filter((name) => isSet(env[name]));
  if (!isSet(env.BREVO_API_KEY) && emailSet.length > 0 && emailSet.length < email.length) {
    const missing = email.filter((name) => !isSet(env[name]));
    warnings.push(`Email is only partly configured (missing ${missing.join(', ')}), so no emails will be sent.`);
  }

  return { errors, warnings };
}

// Called by server.js before anything else when it's run directly.
function assertEnv(env = process.env) {
  const { errors, warnings } = checkEnv(env);
  for (const warning of warnings) console.warn(`[config] Warning: ${warning}`);
  if (errors.length > 0) {
    console.error(
      `[config] The server can't start. Fix these environment variables (see backend/.env.example):\n${
        errors.map((e) => `  - ${e}`).join('\n')}`
    );
    process.exit(1);
  }
}

module.exports = { checkEnv, assertEnv };
