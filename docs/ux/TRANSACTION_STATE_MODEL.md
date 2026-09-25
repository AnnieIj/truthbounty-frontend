# Transaction State Model

This document defines the canonical UI state model for TruthBounty's frontend. It is the
single source of truth for how the client presents chain and API projection state, and it
applies to every user-facing surface that reads or mutates protocol state.

The frontend is a client for the canonical Optimism/EVM protocol. Contracts are
authoritative for protocol mutation; the API is a projection/read layer. The UI must never
fabricate transaction success, settlement, rewards, reputation, or protocol state.

## Core Principles

- **Chain is authoritative.** Contract state, receipts, and finality determine truth.
- **API is a projection.** API responses are read-only projections and may lag the chain.
- **Fail closed.** On unsupported chains, missing configuration, stale critical data, or
  integrity uncertainty, the UI blocks the action and explains why.
- **No invention.** Never fabricate calldata, gas estimates, transaction hashes,
  confirmations, rewards, reputation, or settlement.
- **Optimism/EVM only.** No Stellar, Soroban, Freighter, or alternate-chain runtime code.

## Transaction Lifecycle States

Every transaction surface must model the following states explicitly. Each state has a
user-visible label, an accessibility announcement, and a recovery path.

| State | Meaning | UI Behavior | Recovery |
| --- | --- | --- | --- |
| `idle` | No transaction in flight. | Show the primary action. | N/A |
| `validating` | Pre-flight checks running (chain, account, address, allowance, simulation). | Disable submit; show inline progress. | Cancel returns to `idle`. |
| `rejected` | User rejected in wallet. | Show neutral message; no error styling. | Retry returns to `validating`. |
| `pending` | Submitted; awaiting inclusion. | Show submitted hash from wallet only. | Wait or replace. |
| `confirmed` | Included in a block; not yet final. | Show confirmations count from chain. | Wait for finality. |
| `finalized` | Reached finality per chain rules. | Show success; enable follow-up actions. | N/A |
| `reorged` | Previously confirmed block was reorged out. | Revert to `pending`; announce change. | Re-validate and resubmit. |
| `failed` | Reverted or dropped. | Show revert reason when available. | Retry returns to `validating`. |
| `stale` | Critical projection data is older than its freshness bound. | Block mutation; show refresh action. | Refresh projection. |
| `unsupported` | Chain or configuration not supported. | Block all mutation; explain requirement. | Switch chain / configure. |

### Pre-flight Validation

Before presenting any success state, the client must validate, in order:

1. **Chain** — connected chain matches the canonical Optimism chain id.
2. **Account** — an account is connected and authorized.
3. **Address** — target address is well-formed and matches canonical artifacts.
4. **Signature** — any required signature is present and valid.
5. **Allowance** — token allowance is sufficient where applicable.
6. **Simulation** — the call simulates successfully against current state.
7. **Receipt** — a receipt exists and matches the submitted hash.
8. **Finality** — the receipt has reached the chain's finality threshold.

If any step fails, the UI fails closed and surfaces the corresponding state above.

## Reputation Weight Explanation

Reputation weight is a protocol-defined quantity. The frontend **explains** it; it does
not compute, invent, or assert authority over it.

### Source of Truth

- The **canonical contract ABI/address artifacts** define the on-chain reputation
  interface. The UI reads weight values only through these artifacts.
- The **documented API contracts** define the projection shape for reputation data. The UI
  renders projection fields as-is and never derives new values.
- Any formula, weight, or authority not present in canonical artifacts or documented API
  contracts must not be displayed. If it is missing, the UI shows an `unavailable` state
  rather than guessing.

### UI State Model for Reputation Weight

The reputation weight explanation surface models these states:

| State | Meaning | UI Behavior | Accessibility |
| --- | --- | --- | --- |
| `loading` | Projection or chain read in flight. | Skeleton with stable layout. | `aria-busy="true"`; announce "Loading reputation weight". |
| `empty` | No reputation record for the account. | Neutral empty message; no zero implied. | Announce "No reputation weight available". |
| `ready` | Canonical value present. | Show value with its source label (chain or projection). | Announce value and source. |
| `stale` | Projection older than freshness bound. | Show value with a stale badge and refresh action. | Announce "Reputation weight may be out of date". |
| `rejected` | User declined a required signature or read. | Neutral message; no error styling. | Announce "Reputation weight request declined". |
| `failed` | Read or validation failed. | Show failure with retry; never show a value. | Announce failure and retry availability. |
| `unavailable` | Canonical artifact or API field missing. | Explain that the value is not available; do not substitute. | Announce "Reputation weight unavailable". |

### Component and Hook Boundaries

- A single read hook (e.g. `useReputationWeight`) owns fetching, freshness, and state
  transitions. It returns the state above plus the raw canonical value and its source.
- A presentational component renders the state. It performs no derivation and no
  arithmetic on weight values.
- The hook must not cache across accounts or chains without keying on both.

### Production Failure Behavior

- On unsupported chain or missing configuration, the surface renders `unavailable` and
  blocks any dependent mutation.
- On stale critical data, the surface renders `stale` and requires a refresh before any
  action that depends on the value.
- On read failure, the surface renders `failed` with a retry; it never falls back to a
  cached or invented value.
- The surface never presents a reputation weight as authoritative when it originates from
  a projection that has not been reconciled with chain state.

## Accessibility Requirements

- All states are reachable by keyboard and expose visible focus.
- Every state has a programmatic label and, where it changes, a polite live-region
  announcement.
- Loading and stale states respect `prefers-reduced-motion`.
- Color is never the sole indicator of state; text and icons accompany it.
- Contrast meets WCAG AA for all state text and badges.

## Telemetry and Redaction

- Telemetry records state transitions and error categories, never raw addresses, values,
  or signatures.
- Redaction rules apply uniformly to chain and projection data.

## Non-Goals

- Changing smart-contract or backend protocol authority.
- Adding alternate-chain runtime support.
- Performing an unrelated product redesign.
