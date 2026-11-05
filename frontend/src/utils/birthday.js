import { formatDate } from '../i18n';

// Day 111: a birthday is a month and a day (no year). Shown through a date
// in 2000 -- a leap year, so 29 February works -- at noon UTC, formatted
// in UTC, so no time zone can move it to the day before.
const at = (month, day) => new Date(Date.UTC(2000, month - 1, day, 12));

// "March 5" / "5 مارس"
export const birthdayText = ({ month, day }) => formatDate(at(month, day), 'dayMonth');
export const monthName = (month) => formatDate(at(month, 1), 'month');
// Days in each month, 29 for February (a birthday can be on the 29th).
export const daysIn = (month) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
