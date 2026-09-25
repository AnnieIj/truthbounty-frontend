'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Card (V2-FE-121 primitive)
 *
 * Semantic surface container bound to the `--surface` / `--elevated` tokens.
 * Presentational only: it never implies interactivity. Use `elevated` for
 * content that sits above the base surface (dialogs, popovers, sticky panels).
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render on the elevated surface token instead of the base surface. */
  elevated?: boolean;
}

export function Card({ className, elevated = false, ...rest }: CardProps) {
  return (
    <div
      data-slot="card"
      data-elevated={elevated ? 'true' : undefined}
      className={cn(
        'rounded-xl border border-divider text-ink shadow-sm',
        elevated ? 'bg-elevated' : 'bg-surface',
        className,
      )}
      {...rest}
    />
  );
}

export default Card;
