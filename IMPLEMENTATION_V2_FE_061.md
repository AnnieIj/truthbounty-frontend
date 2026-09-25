# V2-FE-061: Stake and Treasury Withdrawal UX
## Pull Request Summary

### Issue Reference
**V2-FE-061** — Implement Stake and Treasury Withdrawal UX ([#324](https://github.com/DigiNodes/truthbounty-frontend/issues/324))

---

## Overview

Adds a fail-closed Stake & Treasury Withdrawal flow: canonical reserved (stake)
vs unlocked (treasury) balances, recipient/asset validation, per-recipient pull
withdrawals, and isolated failed-recipient outcomes. Wagmi/Viem reads and
confirmed Optimism/EVM receipts remain authoritative; nothing is fabricated.

### Key Deliverables

1. **Types** (`src/app/types/stake-treasury.ts`) — balance view, recipient rows,
   per-recipient outcomes, validation, gate, and batch summary.
2. **Pure logic** (`src/lib/treasury/stake-withdrawal.ts`) — address/asset/amount
   validation, fail-closed access gate, `withdrawTreasury` calldata encoding,
   error classification, and outcome aggregation (no invention).
3. **Hook** (`src/hooks/useStakeTreasuryWithdrawal.ts`) — canonical `balanceOf`
   and `treasuryBalance` reads, staleness, and sequential per-recipient
   submission with independent receipt tracking.
4. **Panel** (`src/components/features/treasury/StakeTreasuryWithdrawalPanel.tsx`)
   — accessible reserved/unlocked balances, recipient/asset rows, per-row errors,
   and an outcomes list that links only real hashes.
5. **Page** (`src/app/(dashboard)/treasury/stake/page.tsx`) plus a link from the
   existing `/treasury` page.

### Acceptance Criteria Mapping

- **Delivered without unrelated redesign** — new page/panel; only a single link
  added to the existing treasury page.
- **Every async state has accessible feedback/recovery** — `role="status"` /
  `aria-live="polite"` banner, per-row errors, refresh/reset, and a shared
  loading/empty/stale/unauthorized/partial/failed vocabulary.
- **Canonical receipts/projections drive lifecycle** — confirmations/finality
  come from `waitForTransactionReceipt` + chain finality config; `partial` is
  reported when any recipient fails.
- **Lint/typecheck/tests/a11y/build** — see validation below.
- **Evidence mapped to criteria** — this document + PR description.
- **Human maintainer approval** — required before merge.

### Security & Architecture

- No Stellar/Soroban/Freighter/mock-wallet/simulator dependencies introduced.
- Fails closed on unsupported chain, incomplete config, missing ABI function,
  disconnected/non-admin wallet, invalid address, or unsupported asset.
- No fabricated calldata, gas, hash, or finality; real hashes come only from the
  wallet/provider.

### Non-Goals (recorded)

- No backend-authoritative mutation.
- No legacy wallet/runtime integrations.
- No redesign beyond the stated workflow.

### Validation

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm test:a11y
pnpm build
```
