'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Shield,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { StatusToneName } from '@/lib/design-tokens';

/**
 * StatusBadge (V2-FE-121 primitive)
 *
 * Accessible status indicator. Meaning is carried by the text label and a
 * distinct icon glyph — never by colour alone (WCAG 1.4.1). Colour tones map
 * to the semantic tokens declared in `globals.css`.
 *
 * Contract:
 * - Render as an inline badge; the visible `label` is the accessible name.
 * - `description` is exposed to assistive tech only (visually hidden).
 * - `live` marks the badge a polite status region for changing transaction
 *   state, so updates are announced without stealing focus.
 */

interface ToneStyle {
  text: string;
  ring: string;
  tint: string;
  Icon: LucideIcon;
}

const TONE_STYLES: Record<StatusToneName, ToneStyle> = {
  neutral: {
    text: 'text-ink-secondary',
    ring: 'border-divider',
    tint: 'bg-surface',
    Icon: Info,
  },
  pending: {
    text: 'text-pending',
    ring: 'border-pending/40',
    tint: 'bg-pending/10',
    Icon: Clock,
  },
  confirmed: {
    text: 'text-confirmed',
    ring: 'border-confirmed/40',
    tint: 'bg-confirmed/10',
    Icon: CheckCircle2,
  },
  finalized: {
    text: 'text-finalized',
    ring: 'border-finalized/40',
    tint: 'bg-finalized/10',
    Icon: Shield,
  },
  orphaned: {
    text: 'text-orphaned',
    ring: 'border-orphaned/40',
    tint: 'bg-orphaned/10',
    Icon: XCircle,
  },
  success: {
    text: 'text-success',
    ring: 'border-success/40',
    tint: 'bg-success/10',
    Icon: CheckCircle2,
  },
  warning: {
    text: 'text-warning',
    ring: 'border-warning/40',
    tint: 'bg-warning/10',
    Icon: AlertTriangle,
  },
  danger: {
    text: 'text-danger',
    ring: 'border-danger/40',
    tint: 'bg-danger/10',
    Icon: AlertTriangle,
  },
  info: {
    text: 'text-info',
    ring: 'border-info/40',
    tint: 'bg-info/10',
    Icon: Info,
  },
};

export interface StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Human-readable status text; this is the accessible name. */
  label: string;
  /** Semantic colour/icon tone. Defaults to `neutral`. */
  tone?: StatusToneName;
  /** Optional extra detail announced to assistive tech only. */
  description?: string;
  /** Announce changes as a polite live region (for transaction state). */
  live?: boolean;
  /** Override the tone's default icon glyph. */
  icon?: LucideIcon;
}

export function StatusBadge({
  label,
  tone = 'neutral',
  description,
  live = false,
  icon,
  className,
  ...rest
}: StatusBadgeProps) {
  const style = TONE_STYLES[tone] ?? TONE_STYLES.neutral;
  const Icon = icon ?? style.Icon;

  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
        style.text,
        style.ring,
        style.tint,
        className,
      )}
      {...(live ? { role: 'status', 'aria-live': 'polite' as const } : {})}
      {...rest}
    >
      <Icon aria-hidden="true" focusable="false" className="size-3.5 shrink-0" />
      <span>{label}</span>
      {description ? <span className="sr-only">. {description}</span> : null}
    </span>
  );
}

export default StatusBadge;
