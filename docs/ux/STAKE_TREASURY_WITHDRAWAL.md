# Stake & Treasury Withdrawal UX (V2-FE-061)

Fail-closed UX for viewing stake/treasury balances and submitting recipient
withdrawals against the canonical Optimism release. The contract is
authoritative; the UI never fabricates a balance, address, calldata, gas
estimate, transaction hash, confirmation, or outcome.

## Entry point

- Page: `/treasury/stake` (`src/app/(dashboard)/treasury/stake/page.tsx`)
- Panel: `src/components/features/treasury/StakeTreasuryWithdrawalPanel.tsx`
- Hook: `src/hooks/useStakeTreasuryWithdrawal.ts`
- Logic: `src/lib/treasury/stake-withdrawal.ts`
- Types: `src/app/types/stake-treasury.ts`

The existing `/treasury` page links to this flow ("Stake & recipient
withdrawal").

## Balance semantics

Two canonical reads are shown side by side; a failed read yields `null` and the
UI fails closed rather than inventing a value:

| Label | Source | Meaning |
| ----- | ------ | ------- |
| Reserved (stake) | `balanceOf(account)` | The connected account's staked/locked balance. |
| Unlocked (treasury) | `treasuryBalance()` | The treasury balance available to withdraw. |

`minBondAmount` from the canonical release parameters is carried through the
balance snapshot when published.

## Recipient/asset validation

- Each recipient must be a canonical EVM address (checksum-format validated);
  Stellar addresses, zero addresses, and placeholder patterns are rejected.
- Only the canonical **native** asset is supported. Any other asset fails
  closed.
- Amounts must be positive integer wei strings and the batch total may not
  exceed the canonical unlocked balance.
- Stale balances and duplicate recipients are surfaced as warnings, never
  silently accepted.

## Pull withdrawal and failure isolation

`withdrawTreasury(to, amount)` is encoded per recipient and submitted one at a
time. Each recipient row has an **independent** outcome:

- A rejected or failed recipient is recorded on its own row and does not roll
  back or mask the others.
- Success (`confirmed`/`finalized`) is asserted only from a real wallet hash
  plus a canonical receipt (finality threshold from the chain config).
- The batch summary reports `partial` when some rows succeed and others fail,
  rather than an unconditional success.

## Fail-closed gates

Submission is blocked (with a safe, user-facing reason) when:

- canonical config/addresses are missing or invalid,
- the canonical ABI does not expose `withdrawTreasury`,
- the wallet is disconnected or on an unsupported/mismatched chain,
- the connected wallet is not the canonical treasury admin.

Balances remain viewable when the caller is not the admin; only the write path
is gated.

## Testing

- `src/lib/treasury/__tests__/stake-withdrawal.test.ts` — pure validation,
  encoding fail-closed, gate, and outcome aggregation.
- `src/hooks/__tests__/useStakeTreasuryWithdrawal.test.ts` — canonical reads and
  per-recipient isolation (one confirmed, one rejected).
- `src/components/features/treasury/__tests__/StakeTreasuryWithdrawalPanel.test.tsx`
  — states, disabled write path, and no-fabricated-hash rendering.
- `src/__tests__/accessibility/stake-treasury.a11y.test.tsx` — jest-axe in ready
  and unauthorized states.
