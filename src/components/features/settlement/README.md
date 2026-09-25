# Settlement & Payout Status (V2-FE-117)

Renders settlement and payout status from canonical inputs, following the
invariants in [`docs/ux/TRANSACTION_STATE_MODEL.md`](../../../../docs/ux/TRANSACTION_STATE_MODEL.md).
Optimism/EVM only.

## Components

### SettlementStatusPanel

```tsx
import { SettlementStatusPanel } from "@/components/features/settlement";

<SettlementStatusPanel
  state="SETTLED"
  finality="finalized"
  payoutWei={1500000000000000000n}
  symbol="TBNT"
  txHash={hash}       // real hash from the wallet/provider, or null
  chainId={10}
  isStale={false}
  isLoading={false}
/>;
```

Accepts every field of `SettlementStatusInput` plus an optional `title`.

## Logic — `src/lib/settlement-status.ts`

`deriveSettlementStatus(input)` maps canonical `state` + transaction `finality`
into an accessible view-model. Precedence:

1. `isLoading` → **loading** (never success).
2. `finality === "reorged"` → **reorged** (removes any success).
3. `isStale` → **stale** (fails closed, no durable success).
4. no `state` → **empty**.
5. otherwise the canonical `STATE_MAP` entry, adjusted by finality.

Invariants enforced:

- A timer/loading never produces success.
- `confirmed` is distinguished from `finalized`; a success-eligible state is
  **downgraded to `confirmed`** unless finality is `finalized` (or no tx was
  tracked and the projection is authoritative).
- `payoutText` is produced **only** from a real `payoutWei` and only for
  payout-bearing states — never fabricated.
- `explorerLinkable` is true only when a real `txHash` exists.

## Accessibility

Labelled `region` with `aria-busy` while loading; the status badge is a polite
live region; payout uses tabular numerals; the explorer link has a descriptive
accessible name and `rel="noopener noreferrer"`.

## Tests

`src/lib/__tests__/settlement-status.test.ts` (all invariants) and
`src/components/features/settlement/__tests__/SettlementStatusPanel.test.tsx`
(component + `jest-axe`).
