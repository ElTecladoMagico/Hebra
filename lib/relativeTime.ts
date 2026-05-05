/**
 * Lightweight Spanish relative-time formatter.
 *
 * Avoids the bundle cost of date-fns for a single helper. Returns short
 * strings like "ahora", "hace 5min", "hace 2h", "hace 3d", "hace 4 sem".
 * For anything older than 8 weeks we fall back to an absolute "DD MMM" date.
 *
 * Intentionally non-locale-aware beyond es: Hebra is es-only for MVP.
 */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const ABS_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;

  // Future or essentially-now: collapse to "ahora" rather than negative durations.
  if (diff < 45_000) return "ahora";
  if (diff < HOUR) return `hace ${Math.round(diff / MIN)}min`;
  if (diff < DAY) return `hace ${Math.round(diff / HOUR)}h`;
  if (diff < WEEK) return `hace ${Math.round(diff / DAY)}d`;
  if (diff < 8 * WEEK) return `hace ${Math.round(diff / WEEK)} sem`;

  // Local-time formatting so users in Madrid see the date they perceive,
  // not the UTC date (a 23:30 local post on Dec 31 would otherwise read "1 ene").
  const d = new Date(timestamp);
  return `${d.getDate()} ${ABS_MONTHS[d.getMonth()]}`;
}
