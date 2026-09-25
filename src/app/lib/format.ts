/**
 * Formatting utilities for UI display
 * Keep ALL UI formatting logic here
 */

/**
 * Shorten long blockchain addresses
 * 0x1234...abcd
 */
export function formatAddress(
  address?: string | null,
  chars = 4
): string {
  if (!address) return '—';

  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format token amounts (TBNT)
 */
export function formatTokenAmount(
  amount?: number | string,
  decimals = 2
): string {
  if (amount === undefined || amount === null) return '0';

  const num = Number(amount);
  if (Number.isNaN(num)) return '0';

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format ISO date to readable UI format
 * Example: Jan 25, 2026
 */
export function formatDate(date?: string | Date): string {
  if (!date) return '—';

  const d = typeof date === 'string' ? new Date(date) : date;

  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format date + time
 * Example: Jan 25, 2026 • 14:32
 */
export function formatDateTime(date?: string | Date): string {
  if (!date) return '—';

  const d = typeof date === 'string' ? new Date(date) : date;

  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toValidDate(date?: string | Date | number): Date | null {
  if (date === undefined || date === null) return null;

  const d = date instanceof Date ? date : new Date(date);

  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format date + time in the user's local timezone.
 * Example: Jan 25, 2026, 2:32 PM
 */
export function formatLocalDateTime(
  date?: string | Date | number,
  opts?: { includeSeconds?: boolean }
): string {
  const d = toValidDate(date);
  if (!d) return '—';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: opts?.includeSeconds ? '2-digit' : undefined,
  }).format(d);
}

/**
 * Format date + time as an absolute UTC value.
 * Example: Jan 25, 2026, 14:32:05 UTC
 */
export function formatUtcDateTime(
  date?: string | Date | number,
  opts?: { includeSeconds?: boolean }
): string {
  const d = toValidDate(date);
  if (!d) return '—';

  const value = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: opts?.includeSeconds ? '2-digit' : undefined,
    hour12: false,
  }).format(d);

  return `${value} UTC`;
}

/**
 * Human-friendly status labels
 */
export function formatStatus(status?: string): string {
  if (!status) return 'Unknown';

  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Compute the 1-based page numbers to render in a compact pagination control.
 * Always includes page 1, the last page, and a window around the current page.
 * `null` entries represent ellipses. Returns at most 7 entries.
 */
export function getPaginationWindow(
  current: number,
  total: number
): Array<number | null> {
  if (!Number.isInteger(current) || !Number.isInteger(total) || total < 1) {
    return [1];
  }

  const clampedCurrent = Math.min(Math.max(1, current), total);
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const window: Array<number | null> = [1];
  const start = Math.max(2, clampedCurrent - 1);
  const end = Math.min(total - 1, clampedCurrent + 1);

  if (start > 2) window.push(null);
  for (let p = start; p <= end; p++) window.push(p);
  if (end < total - 1) window.push(null);
  window.push(total);
  return window;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Human-readable relative age for projection timestamps.
 * Used to make projection staleness visible to users; unknown input renders
 * as the em-dash placeholder rather than a fabricated duration.
 */
export function formatRelativeAge(
  isoTimestamp?: string | null,
  now: number = Date.now()
): string {
  if (!isoTimestamp) return '—';

  const then = Date.parse(isoTimestamp);
  if (!Number.isFinite(then)) return '—';

  const ageMs = Math.max(0, now - then);
  if (ageMs < MINUTE_MS) return 'just now';
  if (ageMs < HOUR_MS) {
    const minutes = Math.floor(ageMs / MINUTE_MS);
    return `${minutes}m ago`;
  }
  if (ageMs < DAY_MS) {
    const hours = Math.floor(ageMs / HOUR_MS);
    return `${hours}h ago`;
  }
  const days = Math.floor(ageMs / DAY_MS);
  return `${days}d ago`;
}
