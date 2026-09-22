// Single "send an email" choke point. No real email provider is wired up
// yet (see PROJECT_DETAILED_GUIDE.md's TASK 2 "Later upgrade" note, written
// when forgot-password first needed this) -- every caller logs the link to
// the console instead. Centralizing it here means that upgrade (swap this
// one function's body for Nodemailer/SendGrid/etc.) is a one-file change
// whenever it actually happens, not a hunt through every controller that
// sends a link.
function sendEmail({ to, subject, text }) {
  console.log(`[email] To: ${to} | Subject: ${subject}\n${text}`);
}

module.exports = { sendEmail };
