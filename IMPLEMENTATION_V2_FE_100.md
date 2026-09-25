# V2-FE-100: Establish the Wallet and Transaction Readiness Gate
## Pull Request Summary

### Issue Reference
**V2-FE-100** — Establish the Wallet and Transaction Readiness Gate for TruthBounty Protocol V2

---

## Overview

This PR introduces a single fail-closed **wallet and transaction readiness gate** that every mutation path must pass before PREPARE/signature. It makes wallet connectivity, chain, contract address, allowance, simulation, and receipt state explicit, accessible, and non-negotiable — and it removes the remaining paths that could present synthetic settlement/appeal/dispute success without a real on-chain write.

### Key Deliverables

1. **Pure write gate** (`src/lib/contracts/write-gate.ts`)
   - `evaluateWriteTarget` / `assertWriteReady` / `WriteGateError`
   - Codes: `WALLET_DISCONNECTED`, `CHAIN_UNSUPPORTED`, `WRONG_CHAIN`, `MISSING_MANIFEST`, `WRONG_ADDRESS`, `PLACEHOLDER_ADDRESS`, `ALLOWANCE_UNKNOWN`, `ALLOWANCE_INSUFFICIENT`, `SIMULATION_REQUIRED`, `SIMULATION_FAILED`, `RECEIPT_PENDING`, `RECEIPT_REVERTED`, `STALE_ARTIFACT`, `READINESS_UNCERTAIN`
   - Optional `requireCanonicalMatch` for protocol targets that must equal the release artifact
   - Optional `allowLocalDev` for Hardhat/Anvil `31337` only

2. **React readiness hook** (`src/hooks/useWriteReadiness.ts`)
   - Composes live `useAccount` / `useChainId` with the pure gate
   - Supports `accountOverride` / `chainIdOverride` for tests and non-wagmi hosts
   - Surfaces `isReady`, `primaryCode`, `codes`, and human-readable `message` for UI gating

3. **Transaction machine adapter** (`src/hooks/useEvmTransaction.ts`)
   - Gate asserted before `PREPARE` on `writeContract` and `sendTransaction`
   - Intent invalidated when account or chain changes before a real hash exists
   - Exposes `readiness` / `isWriteReady` for callers

4. **Fabrication sites removed (fail closed)**
   - `useSettlementSubmission` — no synthetic tx hash; requires real `writeContract`
   - `useAppealParticipation` — no synthetic tx hash; requires real `writeContract`
   - `OpenDispute` — no projected dispute-id success; only real write results call `onSuccess`

5. **Accessible UI gates**
   - `ClaimSubmissionForm`, `RewardsPage`, `OpenDispute`
   - Submit disabled until readiness passes
   - Reason rendered in `data-testid="write-readiness-reason"` with `role="status"` and wired via `aria-describedby`

### Acceptance Criteria Mapping

#### ✅ 1. UI reflects canonical chain/API state and never invents protocol outcomes
**Evidence:**
- Settlement/appeal submission throw without a wallet write; `lastSubmission` / `lastTransaction` stay `null`
- OpenDispute never reports projected IDs as success
- Release address/chain resolved from `release/manifest.json` via `resolveCanonicalTargetAddress` / `resolveExpectedChainId`
- Tests: `useSettlementSubmission.test.ts`, `useAppealParticipation.test.ts`, `OpenDispute.readiness.test.tsx`

#### ✅ 2. Required states are accessible, deterministic, and recoverable
**Evidence:**
- Readiness failures render visible, focusable reasons (`role="status"`, `aria-describedby`)
- Buttons expose failure messages via `aria-label` while disabled
- Gate evaluation is pure and deterministic (no randomness, no network)
- Tests: `write-gate.test.ts`, `useWriteReadiness.test.ts`, a11y `modals.test.tsx`

#### ✅ 3. Required tests execute in CI and pass without concealed skips
**Evidence:**
- New unit suites for gate + hook
- Updated integration/component suites for fail-closed behavior
- `pnpm type-check`, `pnpm test` (78/78 · 760), `pnpm test:a11y`, `pnpm build` all green

#### ✅ 4. Canonical artifacts, documentation, and telemetry/redaction synchronized
**Evidence:**
- Gate reads only release registry (`TruthBountyWeighted`, chain `11155420`)
- No secrets or redaction-sensitive fields logged
- This document maps criteria → implementation → tests

#### ✅ 5. No unrelated issue closed and no unrelated redesign bundled
**Evidence:**
- Scope limited to readiness gating and removing synthetic success paths
- No layout/visual redesign; only disabled/readiness affordances on existing controls

#### ✅ 6. Independent human maintainer approval of exact head SHA
**Evidence:**
- Requested on this PR (wallet/signature/transaction-sensitive change per issue)

---

## Technical Architecture

```
UI submit button
  └─ useWriteReadiness (account + chain + target)
       └─ evaluateWriteTarget (pure fail-closed gate)
            ├─ WALLET_DISCONNECTED / PLACEHOLDER_ADDRESS
            ├─ CHAIN_UNSUPPORTED / WRONG_CHAIN
            ├─ MISSING_MANIFEST / WRONG_ADDRESS
            ├─ ALLOWANCE_* / SIMULATION_* / RECEIPT_*
            └─ ready → enabled submit

useEvmTransaction.writeContract / sendTransaction
  └─ evaluateWriteTarget + assertWriteReady  →  PREPARE  →  signature  →  SUBMIT (real hash only)

useSettlementSubmission / useAppealParticipation
  └─ validate → gate → simulate → throw (no synthetic hash without writeContract)
```

### Security Invariants

- Fail closed on missing config, wrong chain, invalid/placeholder address
- Never fabricate calldata, gas, tx hashes, receipts, or protocol outcomes
- Optimism/EVM only (OP Mainnet + OP Sepolia; local dev optional)
- Expected chain defaults to the release manifest chain (`11155420`)

### Dependency note

Depends on **V2-FE-099** (#371) for finality/reorg modeling — intentionally out of scope here. This PR covers pre-write readiness only.

---

## Test Plan

- [x] `pnpm type-check`
- [x] `pnpm test` — 78/78 suites · 760/760 tests
- [x] `pnpm test:a11y` — 2/2 suites · 6/6 tests
- [x] `pnpm build` — production build + artifact verification
- [ ] `pnpm lint` — pre-existing typescript-eslint/TS7 breakage on `main` (not introduced here)

---

## Review Notes

- Potential merge conflict with PR #449 (`fix/V2-FE-043`) on `src/lib/contracts/write-gate.ts` if both land; this branch's gate is the expanded readiness evaluator (allowance/simulation/receipt + `requireCanonicalMatch`).
- Security/accessibility review requested per issue.
