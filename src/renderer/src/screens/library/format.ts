const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown date';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** "just now", "5 minutes ago", "yesterday", "3 days ago", then an absolute date after a week. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const diff = Math.max(0, now.getTime() - then);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${plural(Math.floor(diff / MINUTE), 'minute')} ago`;
  if (diff < DAY) return `${plural(Math.floor(diff / HOUR), 'hour')} ago`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

/** "12.3 s" under a minute, "2 min 05 s" above. */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / MINUTE);
  const seconds = Math.round((ms % MINUTE) / 1000);
  if (seconds === 60) return `${minutes + 1} min 00 s`;
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
}
