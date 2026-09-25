# V2 Transaction UX State Model

All protocol write hooks and screens implement this shared state model.

| State | Meaning | Required UX |
|---|---|---|
| `idle` | No action started | Show eligibility and prerequisites |
| `validating` | Local/chain preconditions checked | Preserve form and show progress |
| `approvalRequired` | ERC-20 allowance insufficient | Explain separate approval transaction |
| `awaitingSignature` | Wallet request open | Show exact action/network/value |
| `rejected` | User rejected request | Preserve form; safe retry |
| `submitted` | Hash returned, not yet confirmed | Link hash and warn not final |
| `replaced` | Original tx replaced | Follow replacement hash |
| `confirming` | Canonical receipt observed | Show confirmations/finality status |
| `confirmed` | Receipt succeeded | Refresh projections; distinguish from finality |
| `finalized` | Finality policy satisfied | Show durable success |
| `reverted` | Receipt failed | Decode safe error and recovery |
| `dropped` | No canonical receipt within policy | Offer reconciliation/retry guidance |
| `reorged` | Previously observed receipt orphaned | Remove success and reconcile |
| `configurationError` | Chain/address/ABI mismatch | Fail closed; no signature action |

### V2-FE-144 — Reorg/replacement reconciliation mapping

The `reorged` / `replaced` rows are implemented by the canonical projection
reconciliation surface (Optimism/EVM only):

| Concern | Implementation |
|---|---|
| Event transport | `ROLLBACK` / `REPLACEMENT` WebSocket events (`src/app/types/websocket.ts`), delivered to config callbacks **and** typed subscribers by `useWebSocket` |
| Validation & cache plan | `src/lib/reorg-reconciliation.ts` (pure; fail-closed on malformed events, unsupported chains, or hash-shaped uncertainties) |
| Cache reconciliation | `useReorgReconciliation` invalidates affected react-query projections — canonical data only via refetch; never rewritten locally |
| User-visible surface | `ReorgBanner` (`src/components/transactions/ReorgBanner.tsx`), mounted app-wide via `ReorgReconciliationSync` |
| Cursor policy | ROLLBACK resets the resumable cursor to `lastValidCursor`; REPLACEMENT resumes from its own `newCursor` |

Invariants specific to reorg UX:

- A validated `ROLLBACK` is always surfaced — including when no specific
  transaction is tracked — so uncertainty is never hidden.
- Success notices for reorged transactions are withdrawn; only a validated
  `REPLACEMENT` event (carrying a wallet/provider-originated hash) can close
  the outcome. Clients never synthesize the replacement hash.
- Malformed events fail closed: projections are marked stale and the banner
  reports `unresolved` rather than fabricating a resolution.
- The banner is an assertive `role="alert"` live region; the acknowledge
  control is keyboard reachable; display hashes are truncated with the full
  value available via the explorer link.

### V2-FE-111 — Verification and Stake flow mapping

The verification-and-stake journey (Optimism/EVM only) is a two-step write
sequence: an optional ERC-20 `approve` followed by the authoritative
`stake`/verification mutation. It reuses the shared state model above and adds
the following boundaries. Contracts remain authoritative for mutation; the API
is a read/projection layer only.

| Concern | Implementation |
|---|---|
| UI state model | `useVerificationStake` hook owns the state machine; the screen renders only from hook state |
| Component boundary | `VerificationStakeFlow` (form + status) consumes the hook; no protocol logic in the view |
| Preconditions | `validating` checks chain, connected account, canonical address/ABI, and stake amount before any signature |
| Allowance | `approvalRequired` when allowance < stake; approval is a distinct, explained transaction |
| Mutation | Calldata built from canonical ABI/address artifacts; gas is estimated by the provider, never hardcoded |
| Outcome | Hash, confirmations, and finality come only from the wallet/provider and canonical receipt |
| Projections | Rewards, reputation, and settlement refresh from API projections after `confirmed`; never computed client-side |

State-to-UX mapping for this flow:

| State | Verification/stake UX |
|---|---|
| `idle` | Show eligibility, stake amount, and prerequisites |
| `validating` | Disable submit; preserve entered amount |
| `approvalRequired` | Explain the separate approval tx and its exact token/amount |
| `awaitingSignature` | Show action, network, and stake value being authorized |
| `rejected` | Preserve amount; allow safe retry |
| `submitted` | Link the provider hash; warn not final |
| `confirming` | Show confirmations; keep projections marked stale |
| `confirmed` | Refresh reward/reputation/settlement projections; distinguish from finality |
| `finalized` | Show durable success |
| `reverted` | Decode a safe error and offer recovery |
| `dropped` | Offer reconciliation/retry guidance |
| `reorged` | Withdraw success; reconcile via the reorg surface above |
| `configurationError` | Fail closed on unsupported chain or missing/mismatched address/ABI; no signature action |

Invariants specific to verification/stake UX:

- No timer, simulation, or cached value may transition the flow to success;
  only a canonical receipt may.
- The stake amount and any approval are shown exactly as authorized; the UI
  never fabricates calldata, gas, hashes, confirmations, rewards, reputation,
  or settlement.
- Account or chain changes invalidate prepared intent and return to
  `validating`; unsupported chains fail closed.
- Reward, reputation, and settlement values are read from API projections and
  are never derived or estimated in the client.
- The flow is keyboard operable with labeled controls and announced state
  changes; loading, empty, stale, rejected, failed, pending, confirmed,
  finalized, and reorged states are all reachable and recoverable.

## Invariants

- A timer cannot transition a transaction to success.
- A simulated result cannot be displayed as a receipt.
- Hashes come only from the wallet/provider.
- Account or chain changes invalidate incompatible prepared intent.
- UI and cache reconcile to the canonical replacement or reorg outcome.
- Forms preserve user-authored content after recoverable failure.

## RPC and API Fallback

For RPC provider health, API staleness, and chain integrity states, see
[RPC_API_FALLBACK.md](./RPC_API_FALLBACK.md).