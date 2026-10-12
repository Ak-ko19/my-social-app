import i18n from '../i18n';

// Day 57: "512 MB", "1.4 GB" -- in the UI language, with Latin digits
// (like formatDate).
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const locale = i18n.language === 'ar' ? 'ar-u-nu-latn' : undefined;
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${i18n.t(`admin.storage.unit.${UNITS[unit]}`)}`;
}

// "84.5%" the same way.
export function formatPercent(percent) {
  if (percent === null || percent === undefined || !Number.isFinite(Number(percent))) return '';
  const locale = i18n.language === 'ar' ? 'ar-u-nu-latn' : undefined;
  return `${Number(percent).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
}
