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

### V2-FE-115 — Appeal rounds and escalation

Appeal rounds and escalation are read from canonical chain/API projections and
never inferred or fabricated by the client. The UI distinguishes the round
lifecycle from the underlying transaction lifecycle above.

| Appeal state | Meaning | Required UX |
|---|---|---|
| `appealUnavailable` | No appealable round, or window closed | Explain why; no appeal action |
| `appealEligible` | Canonical round open and caller eligible | Show round, deadline, bond, and prerequisites |
| `appealBondRequired` | Bond/allowance insufficient | Explain separate approval/bond transaction |
| `appealAwaitingSignature` | Wallet request open | Show exact action/network/value |
| `appealRejected` | User rejected request | Preserve form; safe retry |
| `appealSubmitted` | Hash returned, not yet confirmed | Link hash; warn not final |
| `appealConfirming` | Canonical receipt observed | Show confirmations/finality status |
| `appealConfirmed` | Receipt succeeded | Refresh round projection; distinguish from finality |
| `appealFinalized` | Finality policy satisfied | Show durable round outcome |
| `appealReverted` | Receipt failed | Decode safe error and recovery |
| `appealReorged` | Observed round/receipt orphaned | Withdraw outcome; reconcile via reorg surface |
| `escalationPending` | Escalation submitted, awaiting canonical resolution | Show pending; never present a resolved outcome |
| `escalationResolved` | Canonical projection reports resolution | Show resolved outcome from projection only |
| `appealConfigurationError` | Chain/address/ABI mismatch | Fail closed; no signature action |

Invariants specific to appeal/escalation UX:

- Round number, deadline, bond, eligibility, and escalation outcome come only
  from canonical contract/API projections; the client never invents them.
- A timer or local clock cannot open, close, or resolve an appeal round.
- Escalation is never shown as resolved until the canonical projection reports
  it; pending escalation is always visibly pending.
- Appeal transactions reuse the shared transaction states above; a reorged or
  replaced appeal transaction withdraws any success notice and reconciles via
  the reorg/replacement surface.
- Unsupported chains, missing configuration, or stale critical round data fail
  closed with no signature action.

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