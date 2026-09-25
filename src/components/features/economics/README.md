# Economic Risk Disclosure (V2-FE-116)

Discloses the bond at risk, protocol fee, appeal window and ERC-20 allowance
state **before** a user authorises a protocol action (verify, dispute, appeal,
settle). Optimism/EVM only.

## Components

### EconomicRiskDisclosure

```tsx
import { EconomicRiskDisclosure } from "@/components/features/economics";

<EconomicRiskDisclosure
  action="Verify"
  bondWei={1000000000000000000n}
  allowanceWei={allowance}        // real on-chain read, or null
  requiredAllowanceWei={bond}
  balanceWei={balance}            // real on-chain read, or null
/>;
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `action` | `string` | — | Action the user is about to sign. |
| `bondWei` | `bigint` | canonical `minBondAmount` | Bond required for this action. |
| `decimals` | `number` | `18` | Token decimals. |
| `symbol` | `string` | `TBNT` | Bond token symbol. |
| `allowanceWei` | `bigint \| null` | `null` | Current allowance; `null` = unverified. |
| `requiredAllowanceWei` | `bigint` | `bondWei` | Allowance needed to skip a separate approval. |
| `balanceWei` | `bigint \| null` | `null` | Spendable balance; `null` = unknown. |

## Logic — `src/lib/economics.ts`

Pure, deterministic helpers. Nothing fabricates an amount: every figure comes
from the canonical release parameters (`release/parameters`) or a real
wallet/allowance read supplied by the caller.

- `getCanonicalEconomicParameters()` — reads + validates the release parameter
  set; **returns `null` (fails closed)** when absent or malformed.
- `formatTokenAmount(wei, decimals=18)` — `formatUnits`, never rounds.
- `bpsToPercent(bps)` — `100 → "1%"`, `250 → "2.50%"`.
- `formatDurationSeconds(s)` — `604800 → "7 days"`; invalid → `"Unknown"`.
- `getAllowanceStatus(current, required)` — `null/undefined → "unknown"`.
- `getBondAffordability(balance, bond)` — `null/undefined → "unknown"`.

## Guarantees

- **Fail closed:** without verified canonical parameters the panel shows no
  amounts and an `role="alert"` warning; the action should not be signed.
- Allowance/balance states are `unknown` until a real read exists — never
  assumed sufficient.
- Accessible: labelled `region`, definition-list values, tabular numerals, and
  status paired with icon + text (never colour alone).

## Tests

`src/lib/__tests__/economics.test.ts` (unit) and
`src/components/features/economics/__tests__/EconomicRiskDisclosure.test.tsx`
(component + `jest-axe`, including the fail-closed path).
