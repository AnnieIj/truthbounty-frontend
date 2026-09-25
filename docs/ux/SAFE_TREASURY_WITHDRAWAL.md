# Safe Treasury Withdrawal UX (V2-FE-119)

## Purpose

Admin-gated withdrawal of protocol treasury funds on Optimism / OP Sepolia with fail-closed integrity.

## State model

`loading | empty | ready | stale | unauthorized | unsupported_chain | missing_config | review | confirming | simulating | awaiting_signature | rejected | pending | failed | confirmed | finalized | reorged`

## Safety rules

- Wallet must match canonical `release/roles/*/admin`.
- Chain must be Optimism (10) or OP Sepolia (11155420).
- Canonical ABI must expose `withdrawTreasury(address,uint256)`.
- Amount must be ≤ live `treasuryBalance` (or native balance fallback).
- Typed confirmation phrase `WITHDRAW` required before submit.
- Simulation must succeed before wallet send.
- `txHash` is null until the wallet returns a real hash — never fabricated.
- Stale balance snapshots block confident submission with an explicit warning.

## Components

- `src/lib/treasury/safe-withdrawal.ts` — pure validation / encoding
- `src/hooks/useSafeTreasuryWithdrawal.ts` — orchestration
- `src/components/features/treasury/SafeTreasuryWithdrawalPanel.tsx` — UI
- Route: `/treasury`
