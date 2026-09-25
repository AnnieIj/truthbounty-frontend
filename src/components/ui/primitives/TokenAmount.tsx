'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * TokenAmount (V2-FE-121 primitive)
 *
 * Deterministic, tabular-numeral display for token/fiat amounts and other
 * protocol quantities. It renders a pre-formatted string as-is and NEVER
 * derives, rounds or invents a value — callers must pass canonical data
 * (from a receipt, projection or protocol parameter).
 */

export interface TokenAmountProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Already-formatted human-readable amount (e.g. "1.0", "12.50"). */
  amount: string;
  /** Unit symbol rendered after the amount (e.g. "TBNT", "USD", "ETH"). */
  symbol?: string;
}

export function TokenAmount({
  amount,
  symbol,
  className,
  ...rest
}: TokenAmountProps) {
  return (
    <span
      data-slot="token-amount"
      className={cn('tb-data font-semibold tabular-nums', className)}
      {...rest}
    >
      {amount}
      {symbol ? (
        <span className="ml-1 font-medium text-ink-muted">{symbol}</span>
      ) : null}
    </span>
  );
}

export default TokenAmount;
