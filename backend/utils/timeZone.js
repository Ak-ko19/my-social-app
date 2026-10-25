// Days 83-84: time zones the app reports (IANA names such as
// "Europe/Istanbul"), for Memories and their morning notification.

// A real zone, as Intl knows them.
function validZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// YYYY-MM-DD of `now` in `tz`.
function todayIn(tz, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

module.exports = { validZone, todayIn };
