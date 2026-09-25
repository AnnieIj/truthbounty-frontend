'use client';

import React from 'react';
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion';

/**
 * V2-FE-071 — Motion-respecting status indicator.
 *
 * Cognitive accessibility contract:
 *  1. The status is ALWAYS communicated by text and color, never by motion
 *     alone — so comprehension is preserved when animation is disabled by the
 *     OS preference or killed by the CSS reduced-motion layer.
 *  2. Animated attention cues (pulse/ping) are rendered only when the user
 *     has NOT asked for reduced motion, and are always decorative
 *     (`aria-hidden`), so screen readers never depend on them.
 *  3. The status is exposed as an ARIA live region so async state changes
 *     (loading → success/error) are announced without any motion at all.
 *
 * This component carries no protocol semantics: it renders caller-provided
 * labels only. Wagmi/Viem and canonical Optimism/EVM receipts remain the
 * authority for transaction/settlement state — this is presentation only.
 */

export type MotionSafeStatusTone = 'neutral' | 'success' | 'error' | 'pending';

const TONE_STYLES: Record<MotionSafeStatusTone, { dot: string; text: string }> = {
  neutral: { dot: 'bg-gray-400', text: 'text-gray-500 dark:text-gray-400' },
  success: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  error: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  // Pending keeps a static (non-animated) amber dot as its non-motion cue.
  pending: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
};

export interface MotionSafeStatusProps {
  /** Machine-stable label, e.g. "Pending", "Confirmed". Announced to AT. */
  label: string;
  /**
   * Longer, human explanation of what the status means and (when relevant)
   * what the user should do next — comprehension without relying on motion.
   */
  detail?: string;
  tone?: MotionSafeStatusTone;
  /**
   * Render the pulsing dot (non-reduced-motion users only). The status never
   * depends on it; it is a redundant, decorative cue.
   */
  pulse?: boolean;
  /** Politeness of the live-region announcement. */
  politeness?: 'polite' | 'assertive';
  className?: string;
}

export function MotionSafeStatus({
  label,
  detail,
  tone = 'neutral',
  pulse = false,
  politeness = 'polite',
  className = '',
}: MotionSafeStatusProps) {
  const reducedMotion = usePrefersReducedMotion();
  const styles = TONE_STYLES[tone] ?? TONE_STYLES.neutral;
  const showPulse = pulse && !reducedMotion;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 rounded-full ${styles.dot} ${showPulse ? 'animate-pulse' : ''}`}
      />
      <span
        role="status"
        aria-live={politeness}
        aria-atomic="true"
        className={`text-xs font-medium ${styles.text}`}
      >
        {label}
        {detail ? <span className="sr-only">. {detail}</span> : null}
      </span>
    </span>
  );
}

export default MotionSafeStatus;
