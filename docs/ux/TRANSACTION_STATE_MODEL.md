# Transaction State Model

This document defines the canonical UI state model for TruthBounty's frontend. It is the
single source of truth for how the client represents chain and API projection state, and
for how confidence and verification outcomes are surfaced to users.

The frontend is a user-facing client for the canonical Optimism/EVM protocol. It must
present chain and API projection state accurately, construct valid user-authorized
transactions, and make uncertainty visible. It must **never** fabricate transaction
success, settlement, rewards, reputation, or protocol state.

## Authority and Data Sources

- **Contracts are authoritative** for all protocol mutation (verification, disputes,
  appeals, settlement, rewards).
- **The API is a projection/read layer only.** It reflects indexed chain state and may lag
  behind the chain head.
- **Canonical artifacts** (contract ABI/address files and documented API contracts) are the
  only permitted sources for calldata, addresses, and response shapes. No placeholder
  addresses, mocks, or invented values may ship in production bundles.
- Optimism/EVM only. No Stellar, Soroban, Freighter, or alternate-chain runtime code.

## Transaction Lifecycle States

Every user-authorized transaction moves through the following states. The UI must render
the exact state observed from the wallet/provider and chain — never an assumed one.

| State | Meaning | UI Behavior |
| --- | --- | --- |
| `idle` | No transaction in flight. | Show the action affordance. |
| `validating` | Pre-flight checks running (chain, account, address, allowance, simulation). | Disable submit; announce "Validating". |
| `rejected` | User rejected in wallet, or pre-flight failed closed. | Show recoverable error; re-enable action. |
| `pending` | Submitted; hash known; not yet mined. | Show hash + explorer link; allow replacement awareness. |
| `confirmed` | Included in a block; receipt observed. | Show confirmations count; do not claim finality. |
| `finalized` | Finality threshold reached per canonical config. | Show finalized; enable dependent actions. |
| `reverted` | Receipt status indicates revert. | Show failure with reason if available; never show success. |
| `replaced` | Transaction replaced (same nonce, new hash). | Surface replacement; track the winning hash. |
| `reorged` | Previously confirmed tx no longer canonical. | Downgrade to pending/unknown; re-verify before success. |
| `failed` | Terminal failure (dropped, unsupported chain, missing config). | Fail closed; explain recovery path. |

### Pre-flight Validation (fail closed)

Before presenting any success, the client must validate:

1. **Chain** — connected chain matches the canonical Optimism chain id; otherwise fail closed.
2. **Account** — a connected, authorized account exists; handle disconnect and account change.
3. **Address** — target address comes from canonical artifacts, not user- or mock-supplied values.
4. **Signature** — user authorization is present and matches the intended payload.
5. **Allowance** — token allowance is sufficient where required.
6. **Simulation** — call simulation succeeds; surface revert reasons.
7. **Receipt** — receipt is fetched and its status checked before any success UI.
8. **Finality** — finality is confirmed against canonical thresholds before claiming finality.

If any check is missing, stale, or uncertain, the UI must **fail closed** and present a
recoverable error rather than a success state.

## Confidence and Verification Outcomes

Confidence and verification outcomes are **projections**, not protocol truth. They must be
rendered with their provenance and uncertainty made explicit.

### Confidence Display

- Confidence values originate from the API projection layer and/or on-chain verification
  records. The UI must not compute or invent confidence.
- Always show the **source** (API projection vs. on-chain record) and the **as-of**
  timestamp/block so users can judge staleness.
- Represent confidence as a bounded, labeled value (e.g. low / medium / high or a numeric
  range) with an accessible text equivalent — never color alone.
- When confidence is unavailable, show an explicit "unknown" state; do not default to a
  favorable value.

### Verification Outcome States

| Outcome | Meaning | UI Behavior |
| --- | --- | --- |
| `unverified` | No verification record yet. | Show neutral state; no implied success. |
| `pending` | Verification in progress / awaiting confirmation. | Show progress; disable dependent claims. |
| `verified` | Canonical verification record confirms outcome. | Show verified with source + as-of. |
| `disputed` | Outcome under dispute. | Show dispute status; link to dispute context. |
| `appealed` | Dispute under appeal. | Show appeal status; keep outcome provisional. |
| `settled` | Settlement recorded on-chain. | Show settled only when chain confirms it. |
| `stale` | Projection older than the freshness threshold. | Mark stale; prompt refresh; do not present as current. |
| `unknown` | Projection unavailable or integrity uncertain. | Fail closed; show recoverable error. |

### Staleness and Freshness

- Define a freshness threshold per data class (e.g. confidence, verification, settlement).
- When a projection exceeds its threshold, mark it `stale` and avoid presenting it as
  current. Critical stale data must fail closed.
- Reorgs invalidate prior confirmations; re-verify before restoring any success state.

## Accessibility Requirements

All states must be accessible, responsive, deterministic, and recoverable:

- **Keyboard & focus** — every action and state transition is reachable and focus is managed
  on state change.
- **Labels** — controls and status regions have programmatic labels.
- **Announcements** — state changes (pending, confirmed, finalized, reverted, reorged,
  failed) are announced via live regions.
- **Contrast** — status colors meet contrast requirements; never rely on color alone.
- **Reduced motion** — respect `prefers-reduced-motion` for progress and transition animations.

## Failure Behavior (Production)

- Unsupported chain, missing configuration, stale critical data, or integrity uncertainty
  must **fail closed** with a clear, recoverable message.
- Never fabricate calldata, gas estimates, transaction hashes, confirmations, rewards,
  reputation, or settlement.
- No hidden administrative bypasses and no unsafe HTML rendering.
- Telemetry must follow redaction rules: never log secrets, signatures, or full addresses
  beyond documented, redacted fields.

## Testing Expectations

- **Unit/component** — success, boundary conditions, and every documented user-visible
  failure state.
- **Wallet/provider integration** — rejection, disconnect, account/chain change, replacement,
  revert, and finality.
- **Accessibility** — keyboard, focus, labels, announcements, contrast, reduced motion.
- **E2E** — against canonical mocks or staging dependencies that cannot leak into production
  bundles.
- **CI gates** — lint, typecheck, tests, production build, accessibility, E2E,
  dependency/security, and artifact-drift.

## Non-Goals

- Changing smart-contract or backend protocol authority.
- Adding alternate-chain runtime support.
- Unrelated product redesign.
