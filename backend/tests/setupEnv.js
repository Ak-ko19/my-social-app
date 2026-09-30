// Jest `setupFiles`: runs in every test file BEFORE the app is required.
// server.js calls dotenv, which would otherwise load the developer's real
// backend/.env into the test run: real SMTP credentials would make every
// signup test send a real email, and real Cloudinary keys would be live.
// dotenv never overrides a variable that's already set (even to ''), so
// pinning test-safe values here wins over .env locally, and also provides
// what a fresh CI checkout (no .env at all) needs.
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.DATABASE_URL = ''; // db.js is mocked (see helpers/setupTestApp.js); never the real DB
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.FRONTEND_URL = 'http://localhost:5173';

// Blank = "not configured": utils/email.js falls back to console logging.
// BREVO_API_KEY too: a real key in .env would otherwise send real emails.
process.env.BREVO_API_KEY = '';
process.env.EMAIL_HOST = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASS = '';
process.env.EMAIL_FROM = '';

// Day 9: tests that need the cleanup endpoint set their own secret.
process.env.CLEANUP_SECRET = '';
// Day 10: a real Sentry DSN in .env must never receive test errors.
process.env.SENTRY_DSN = '';
// Day 11: real Turnstile keys in .env would make every signup test need a
// Cloudflare token; turnstile.test.js sets its own.
process.env.TURNSTILE_SITE_KEY = '';
process.env.TURNSTILE_SECRET_KEY = '';
process.env.TURNSTILE_VERIFY_URL = '';

process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
