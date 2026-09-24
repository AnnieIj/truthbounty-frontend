# TruthBounty V2 Information Architecture

**Status:** Implementation baseline  
**Approved runtime:** Optimism/EVM

## Primary navigation

1. **Claims**
   - All claims
   - Claim detail
   - Evidence
   - Verification status
2. **Submit Claim**
3. **My Activity**
   - Submitted claims
   - Verifications
   - Disputes and appeals
   - Rewards and withdrawals
4. **Verifiers**
   - Open verification
   - Active disputes
   - Reputation
5. **Protocol**
   - How it works
   - Parameters and supported assets
   - Contract/deployment provenance
6. **Settings**
   - Wallet and network
   - Session and identity
   - Notification/accessibility preferences

## Route map

| Route | Purpose | Authoritative source |
|---|---|---|
| `/claims` | Searchable claim feed | API projection |
| `/claims/[claimId]` | Lifecycle, evidence, verification, settlement and dispute | API projection + receipt status |
| `/claims/new` | Build and submit claim transaction | Canonical contract manifest |
| `/verify` | Claims currently accepting verification | API projection |
| `/disputes` | Challenge windows and appeal rounds | API projection |
| `/activity` | Wallet-scoped activity | API projection |
| `/rewards` | Finalized entitlements and withdrawals | Contract read + API projection |
| `/protocol` | Network, release and contract provenance | Versioned manifest |
| `/settings` | Wallet/session/user preferences | Wallet + non-authoritative API |

## Claim-detail hierarchy

1. Claim statement and lifecycle status.
2. Finality/freshness indicator.
3. Bounty, stake and deadline summary.
4. Evidence timeline.
5. Verification/aggregation summary.
6. Available wallet action.
7. Settlement or dispute timeline.
8. Reward/refund/withdrawal outcome.
9. Technical provenance.

## Responsive behaviour

- Mobile: one primary action, stacked summaries, collapsible technical detail.
- Tablet: two-column claim/action layout where space permits.
- Desktop: content column, contextual action rail and lifecycle timeline.
- At 200% zoom, no two-dimensional scrolling is required except genuine data tables.

## Information-state requirements

Every route defines loading, empty, partial, stale, degraded, error, offline and unauthorized states. Protocol actions additionally define wrong-chain, approval-required, signature-requested, rejected, submitted, replaced, confirming, finalized, reverted, dropped and reorged states.

## Content rules

Use “projected”, “confirmed” and “finalized” precisely. Do not use “verified” as a synonym for “true”. Do not promise rewards before final settlement. Amounts show token units and base-unit-safe formatting.
