import i18n from '../i18n';

// Day 55: how an event's time reads, in the viewer's language and time
// zone (Arabic with Latin digits, like formatDate).
const locale = () => (i18n.language === 'ar' ? 'ar-u-nu-latn' : undefined);
const day = (d) => d.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' });
const time = (d) => d.toLocaleTimeString(locale() || [], { hour: '2-digit', minute: '2-digit' });
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "Saturday, October 12 · 06:00 PM – 09:00 PM"; an end on another day
// gets its own date.
export function formatEventTime(startsAt, endsAt) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const first = `${day(start)} · ${time(start)}`;
  if (!endsAt) return first;
  const end = new Date(endsAt);
  return sameDay(start, end) ? `${first} – ${time(end)}` : `${first} – ${day(end)} · ${time(end)}`;
}

// The calendar badge: { month: "OCT", day: "12" }.
export function eventBadge(startsAt) {
  const d = new Date(startsAt);
  return {
    month: d.toLocaleDateString(locale(), { month: 'short' }),
    day: d.toLocaleDateString(locale(), { day: 'numeric' })
  };
}
