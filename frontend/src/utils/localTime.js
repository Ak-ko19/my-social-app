// <input type="datetime-local"> works in local time without a zone:
// "2026-10-07T15:15". These convert to and from it (Day 45; shared with
// events on Day 55).
const pad = (n) => String(n).padStart(2, '0');

export function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value) {
  const d = new Date(value); // a zone-less date-time is read as local time
  return Number.isNaN(d.getTime()) ? null : d;
}

// The time zone the date-time picker is in, e.g. "Asia/Dubai".
export function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}
