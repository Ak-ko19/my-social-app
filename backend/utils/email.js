const nodemailer = require('nodemailer');

// Only set up a real transport when all three creds are present -- lets a
// fresh clone/CI run without SMTP configured at all (falls back to the
// original console.log behavior below) instead of failing every signup
// until someone sets up email. See backend/.env.example for what these
// need to be (Gmail + an App Password is the $0 starting point).
const isConfigured = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })
  : null;

// Single "send an email" choke point. Every caller (signup/resend
// verification, forgot-password) goes through this one function, so the
// transport itself (Gmail SMTP today, any other SMTP-compatible provider
// later) is an env-var swap, not a code change -- see .env.example.
// Never throws: a transient SMTP failure shouldn't fail the signup/
// forgot-password request itself, only show up in the server logs.
async function sendEmail({ to, subject, text }) {
  if (!isConfigured) {
    console.log(`[email] (EMAIL_HOST/EMAIL_USER/EMAIL_PASS not set -- logging instead) To: ${to} | Subject: ${subject}\n${text}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text
    });
  } catch (err) {
    console.error(`[email] Failed to send to ${to}: ${err.message}`);
  }
}

module.exports = { sendEmail };
