'use client';

import React from 'react';

/**
 * V2-FE-071 — Time-sensitive window presentation.
 *
 * Comprehension contract (cognitive accessibility):
 *  - The remaining time is always plain text, never an animated progress bar
 *    alone — comprehension survives with all animation disabled.
 *  - The deadline value comes from canonical protocol projections supplied by
 *    the caller (block-derived deadlines from dispute/appeal contexts). This
 *    component NEVER computes or guesses deadlines; if `secondsRemaining` is
 *    null/undefined it renders the caller's "unknown" copy instead of
 *    inventing one — fail closed on unsupported/unknown state.
 *  - When the user prefers reduced motion, urgency is conveyed by text and
 *    color contrast only (no pulsing, no progress animation).
 */

export type TimeUrgency = 'normal' | 'urgent' | 'expired' | 'unknown';

const URGENCY_STYLES: Record<TimeUrgency, string> = {
  normal: 'text-zinc-300 dark:text-zinc-400',
  urgent: 'text-amber-600 dark:text-amber-400 font-semibold',
  expired: 'text-red-600 dark:text-red-400 font-semibold',
  unknown: 'text-zinc-500 dark:text-zinc-500 italic',
};

export interface TimeRemainingNoticeProps {
  /**
   * Canonical seconds remaining from a protocol projection (NOT client-guessed).
   * `null`/`undefined` means "unknown" — the component fails closed and renders
   * `unknownLabel` rather than fabricating a countdown.
   */
  secondsRemaining?: number | null;
  /** Canonical label, e.g. "Dispute window", "Appeal window". */
  windowLabel: string;
  /** Rendered when secondsRemaining is null/undefined (unknown state). */
  unknownLabel?: string;
  /** Threshold (seconds) under which urgency text is emphasized. Default 3600 (1h). */
  urgencyThresholdSeconds?: number;
  /** Optional extra context (e.g. block number the deadline derives from). */
  detail?: string;
  className?: string;
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return 'unknown duration';
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor((totalSeconds / 3600) % 24);
  const d = Math.floor(totalSeconds / 86400);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} day${d === 1 ? '' : 's'}`);
  if (h > 0) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (parts.length === 0 && s > 0) parts.push('less than a minute');
  return parts.length > 0 ? parts.join(', ') : 'closed';
}

export function TimeRemainingNotice({
  secondsRemaining,
  windowLabel,
  unknownLabel = 'Deadline unknown — check the canonical record before acting.',
  urgencyThresholdSeconds = 3600,
  detail,
  className = '',
}: TimeRemainingNoticeProps) {
  // Presentation is fully text-first, so there is nothing to suppress under
  // reduced motion; the hook is re-exported below for imperative consumers.

  let urgency: TimeUrgency;
  let text: string;

  if (typeof secondsRemaining !== 'number' || !Number.isFinite(secondsRemaining)) {
    urgency = 'unknown';
    text = unknownLabel;
  } else if (secondsRemaining <= 0) {
    urgency = 'expired';
    text = `${windowLabel} closed.`;
  } else {
    text = `${windowLabel} closes in ${formatDuration(secondsRemaining)}.`;
    urgency = secondsRemaining <= urgencyThresholdSeconds ? 'urgent' : 'normal';
  }

  return (
    <p
      data-testid="time-remaining-notice"
      role="note"
      className={`text-xs leading-5 ${URGENCY_STYLES[urgency]} ${className}`.trim()}
    >
      {text}
      {detail ? <span className="sr-only"> {detail}</span> : null}
    </p>
  );
}

// Re-export for callers that want a motion-aware alternative.
export { usePrefersReducedMotion } from '@/hooks/useReducedMotion';

export default TimeRemainingNotice;
