# Rewards Claim Flow (V2-FE-118)

Accessible rewards claim journey: shows the claimable projection, a single
authorise action, and honest transaction state. Contracts remain authoritative;
the API is only a read projection. Optimism/EVM only.

## Components

### RewardsClaimFlow

```tsx
import { RewardsClaimFlow } from "@/components/features/rewards";

<RewardsClaimFlow symbol="TBNT" />;
```

Renders the total claimable, the reward rows, the claim action, live
confirmations while busy, and an explorer link once a real hash exists. Every
disabled action carries an accessible explanation (`aria-describedby`).

## Hook — `src/hooks/useRewardsClaim.ts`

Wired to the canonical contract registry (address, ABI, release chain id) and
the read/projection layer.

Returns `rewards`, `totalClaimable`, `status`, `eligibility`, `txHash`,
`chainId`, `confirmations`, `requiredConfirmations`, `errorMessage`, `claim()`
and `refresh()`.

Guarantees:

- **Fails closed** on a disconnected wallet, unsupported/mismatched chain or an
  empty projection (see `computeClaimEligibility`).
- The claim always targets the **canonical release chain id**, regardless of the
  wallet's current chain.
- Success is derived from a **real receipt + canonical chain finality**
  (`requiredConfirmations` from chain config), never from a timer.
- Wallet/RPC error text is classified into a safe message; raw errors are never
  surfaced.

## Logic — `src/lib/rewards-claim.ts`

- `computeClaimEligibility(input)` — fail-closed gate returning
  `{ canClaim, reason, message }`.
- `sumClaimable(rewards)` — ignores non-finite rows so a malformed projection
  can never inflate the total.
- `claimStatusBadge(status)` — maps each lifecycle state to a tone + label.
- `classifyClaimError(error)` — rejection / revert / approval / generic, with a
  safe message.

## Status lifecycle

`idle → loading → awaitingSignature → submitted → confirming → confirmed →
finalized`, with `rejected`, `reverted`, `approvalRequired` and `error` as
terminal failure states.

## Tests

`src/lib/__tests__/rewards-claim.test.ts` (unit),
`src/components/features/rewards/__tests__/RewardsClaimFlow.test.tsx`
(component + `jest-axe`) and
`src/hooks/__tests__/useRewardsClaim.test.ts` (fail-closed + submit path).
