# V2-FE-091: Formalize the Canonical Wallet Provider Boundary

## Pull Request Summary

### Issue Reference

**V2-FE-091** — Formalize the Canonical Wallet Provider Boundary for TruthBounty Protocol V2

---

## Overview

This PR formalizes the boundary between the UI and the wallet/provider layer. It strengthens wallet connectivity, signature, allowance, and transaction lifecycle correctness by centralizing all wallet state into a deterministic, discriminated-union model that fails closed on misconfiguration, unsupported chains, and invalid accounts.

The implementation provides:

- A canonical wallet boundary state model (`WalletBoundaryState`) with six explicit phases: `loading`, `disconnected`, `unsupported`, `config_error`, `account_error`, and `ready`.
- A configuration guard that rejects placeholder/missing WalletConnect project IDs, unsupported default chains, and invalid RPC URLs in production.
- A single-source-of-truth hook (`useCanonicalWallet`) that composes the existing `useWallet` and `useWalletNetwork` primitives.
- An accessible gate component (`WalletBoundaryGate`) that renders keyboard-focusable, screen-reader-friendly states for every non-ready boundary phase.
- A new `reorged` terminal state in the shared transaction state machine so the UI can represent chain-reorg failures without fabricating success.
- Hardened `wagmi.ts` and `web3.ts` configuration so supported chain IDs are derived from the canonical config and a real WalletConnect project ID is required in production.

---

## Key Deliverables

1. **Canonical Wallet Boundary Types** (`src/lib/wallet-boundary/types.ts`)

   - `WalletBoundaryState` discriminated union with `status`, `isLoading`, `isSupportedNetwork`, `isReady`, `isProtocolDisabled`, `address`, `chainId`, `connectorError`, and `configError`.
   - `WalletBoundaryActions` for `connect`, `reconnect`, `disconnect`, `clearError`, `switchToSupportedNetwork`, and `addSupportedNetwork`.
   - `CanonicalWallet` type combining state and actions.

2. **Wallet Provider Configuration Guard** (`src/lib/wallet-boundary/config-guard.ts`)

   - Validates `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_SUPPORTED_CHAIN_IDS`, `NEXT_PUBLIC_DEFAULT_CHAIN_ID`, and RPC URLs.
   - Rejects placeholder strings (`yourprojectid`, `placeholder`, `dummy`, `example`, etc.).
   - Fails closed in production by requiring real RPC endpoints.
   - Exposes `validateWalletProviderConfig(env?)` for unit testing and `assertWalletProviderConfig(env?)` for mount-time guards.

3. **Canonical Wallet Hook** (`src/hooks/useCanonicalWallet.ts`)

   - `useCanonicalWallet()` returns the unified boundary state and actions.
   - `deriveWalletBoundaryState(...)` is a pure, unit-testable reducer from underlying wallet/network/config state to the boundary union.
   - Never fabricates addresses, chain IDs, balances, or transaction outcomes.
   - Validates the connected address against the canonical address guard.
   - Surfaces unsupported-chain and connector errors as first-class boundary states.

4. **Accessible Wallet Boundary Gate** (`src/components/wallet/WalletBoundaryGate.tsx`)

   - Renders `loading`, `disconnected`, `config_error`, `unsupported`, `account_error`, and children (ready) states.
   - Each state uses semantic ARIA roles (`status`/`alert`), `aria-live`, focusable buttons, and high-contrast warning/error styles.
   - Supports optional custom render props for every non-ready state.

5. **Web3Provider Configuration Gate** (`src/components/providers/Web3Provider.tsx`)

   - Validates wallet provider configuration before mounting Wagmi.
   - Renders an accessible configuration error fallback and fails closed when required environment variables are missing or placeholder values are detected in production.

6. **Transaction State Machine Reorg Support** (`src/lib/transaction-machine/transaction-machine.types.ts`, `src/lib/transaction-machine/transaction-machine.ts`, `src/hooks/useTransactionMachine.ts`)

   - Added `TxStateReorged` and `REORG` event.
   - `confirming` and `safe` can transition to `reorged`.
   - `reorged` is a terminal failure state allowing `RETRY`/`RESET`.
   - Added `onReorged` callback to `useTransactionMachine`.

6. **Hardened Configuration**

   - `src/config/wagmi.ts`: Requires a real `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in production; dev/CI fallback is clearly labelled and only used outside production.
   - `src/hooks/web3.ts`: `useIsSupportedChain` now derives `supportedChainIds` from the canonical `supportedChains` export instead of a hardcoded array.

---

## Acceptance Criteria Mapping

### 1. UI reflects canonical chain/API state and never invents protocol outcomes

**Evidence:**

- `useCanonicalWallet` derives `address` and `chainId` directly from Wagmi.
- `deriveWalletBoundaryState` returns `undefined` address/chain when not ready.
- Tests assert no `balance`, `txHash`, `rewards`, or `reputation` properties are exposed on the boundary.
- Integration test verifies the boundary transitions through real connector states without synthetic data.

### 2. All required states are accessible, responsive, deterministic, and recoverable

**Evidence:**

- `WalletBoundaryState` covers `loading`, `disconnected`, `config_error`, `unsupported`, `account_error`, `ready`.
- `WalletBoundaryGate` uses `role="status"`/`role="alert"`, `aria-live`, and focusable recovery buttons.
- Transaction machine now covers `reorged` in addition to existing success/failure states.
- Unit tests cover every boundary state and every transaction machine reorg transition.

### 3. Required tests execute in CI and pass without concealed skips

**Evidence:**

- New tests:
  - `src/lib/wallet-boundary/__tests__/config-guard.test.ts`
  - `src/hooks/__tests__/useCanonicalWallet.test.tsx`
  - `src/components/wallet/__tests__/WalletBoundaryGate.test.tsx`
  - `src/__tests__/integration/wallet-provider-boundary.test.tsx`
  - Updated `src/__tests__/unit/transaction-machine.test.ts` with reorg coverage.
- Full suite passes: 758 tests across 82 suites.

### 4. Canonical artifacts, documentation, and telemetry/redaction rules are synchronized

**Evidence:**

- `IMPLEMENTATION_V2_FE_091.md` documents the new boundary, state model, and acceptance mapping.
- No new telemetry or secrets are introduced.
- Configuration guard rejects placeholder secrets/addresses.

### 5. No unrelated issue is closed and no unrelated redesign is bundled

**Evidence:**

- No page or visual component redesigns.
- No smart-contract or backend protocol changes.
- Scope is strictly the wallet/provider boundary and the reorg state extension.

### 6. Security/accessibility/protocol approval required for wallet/transaction/CI-sensitive changes

**Evidence:**

- Files touched are under sensitive paths (`src/hooks/useWallet.ts`, `src/lib/transaction-machine/`, `src/config/wagmi.ts`, `src/components/wallet/`).
- `sensitive-paths.ts` already flags these paths for manual review.

---

## Security Invariants

- Optimism/EVM only: no Stellar, Soroban, Freighter, or alternate-chain runtime code added.
- Contracts remain authoritative; the API remains a projection/read layer.
- No fabricated calldata, gas estimates, transaction hashes, confirmations, rewards, reputation, or settlement.
- Fail closed on unsupported chains, missing configuration, stale critical data, or integrity uncertainty.
- No production mocks, placeholder addresses, secrets, unsafe HTML, or hidden administrative bypasses.
