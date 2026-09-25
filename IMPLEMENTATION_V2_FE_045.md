# V2-FE-045: Make Wallet Reconnection Deterministic
## Pull Request Summary

### Issue Reference
**V2-FE-045** — Make Wallet Reconnection Deterministic (DigiNodes/truthbounty-frontend#308)

---

## Overview

Wallet reconnection is now driven by a single deterministic policy that treats
the **active provider as authoritative** and the persisted connector id as a
non-binding hint. A stale cached session can no longer present itself as a
connected wallet, and a provider-confirmed connection is never raced by a
client-initiated reconnect.

### Key Deliverables

1. **Pure reconnection policy** (`src/lib/wallet/reconnect.ts`)
   - `planWalletReconnect` — deterministic decision: `idle` (with reason) or
     `connect`
   - `resolveProviderStatus` — maps raw wagmi flags to a provider status
   - `isSupportedWalletChain` / `isValidWalletAccount` /
     `isTrustedProviderConnection` — fail-closed validation
   - `WALLET_CONNECTOR_PREF_KEY` — the only persisted hint (connector id only)
   - Reasons: `provider-connected`, `provider-connecting`,
     `provider-unsupported-chain`, `provider-invalid-account`,
     `no-preference`, `preferred-connector`, `connector-unavailable`

2. **`useWallet` restored from provider state only** (`src/hooks/useWallet.ts`)
   - `isConnected` is true only when the provider confirms a canonical account
     **and** a supported Optimism chain
   - a malformed/placeholder account fails closed (`isConnected === false`)
   - a supported-but-wrong chain surfaces `state: 'unsupported-chain'` and
     `unsupportedChain: true` instead of a phantom `connected`
   - the connector hint is persisted only for a confirmed usable session, and
     dropped when the provider is untrusted or the connector no longer exists
   - `reconnect()` never races an in-flight/established provider connection

3. **Stale SIWE sessions cannot appear authenticated**
   - `isSessionBoundToAccount` (`src/lib/auth/session-store.ts`) binds a session
     to the provider-confirmed owner (case-insensitive, expiry-aware)
   - `SiweAuthProvider` only reports `isAuthenticated` for a bound session and
     clears unbound sessions once the provider settles — while leaving the
     session untouched during an in-flight reconnect

4. **Accessible, deterministic wallet UI** (`src/components/WalletConnection.tsx`)
   - disconnect routes through the wallet boundary (clears the cached hint)
   - every lifecycle state is announced via an sr-only `role="status"` live
     region (`describeWalletState`), with recovery guidance
   - no visual redesign: the existing controls and layout are unchanged

### Acceptance Criteria Mapping

#### ✅ 1. Delivered without unrelated visual redesign
**Evidence:**
- `WalletConnection` keeps its existing buttons; only an sr-only status region
  was added (no style/structure changes).
- Diff touches wallet/auth lifecycle + tests only.

#### ✅ 2. Every asynchronous state has accurate accessible feedback and recovery
**Evidence:**
- `describeWalletState` maps all six `WalletLifecycleState` values to
  human-readable text, rendered in `role="status"` `aria-live="polite"`.
- Tests: `src/__tests__/accessibility/wallet-connection.test.tsx`
  (disconnected, connected, reconnecting, unsupported-network, axe, keyboard).

#### ✅ 3. Canonical provider receipts/projections — not timers or client guesses — drive lifecycle state
**Evidence:**
- `useWallet` derives `isConnected`/`state` from the provider snapshot and the
  pure policy; no timers, no `Math.random`, no fabricated address/chain.
- Stale hints are cleared deterministically (`planWalletReconnect.clearPreference`).
- Tests: `src/lib/wallet/__tests__/reconnect.test.ts`,
  `src/hooks/__tests__/useWallet.test.tsx`,
  `src/__tests__/integration/wallet-lifecycle.test.tsx`.

#### ✅ 4. Lint, typecheck, tests, accessibility, artifact-drift, production build pass
**Evidence (local):**
- `pnpm type-check` — clean
- `pnpm test` — **79/79 suites · 767/767 tests**
- `pnpm test:a11y` — **3/3 suites · 13/13 tests**
- `pnpm build` — artifact verification + production build succeed
- `pnpm lint` — **blocked by a pre-existing tooling break** on `main`
  (`typescript-eslint does not support TS 7.0`, ESLint 10.10.0); not introduced
  by this change.

> **Test-discovery fix:** `src/hooks/tests/useWallet.test.tsx` (and its sibling
> `useReputation.test.tsx`) were never executed because Jest only discovers
> `__tests__` directories here. `useWallet.test.tsx` was relocated to
> `src/hooks/__tests__/` so the wallet lifecycle regression tests actually run.
> (`useReputation.test.tsx` is out of scope for this PR.)

#### ✅ 5. The PR maps evidence to every acceptance criterion
**Evidence:**
- This document.
- Regression guard: `src/__tests__/regression/mock-removal.test.ts` asserts the
  production reconnect files import no mocks/simulators, contain no
  `Math.random`, and that the pure policy never reads storage identity.

#### ✅ 6. Human maintainer approval recorded for wallet/security-sensitive changes
**Evidence:**
- `src/hooks/useWallet.ts` and the auth boundary are sensitive paths
  (`src/lib/security/sensitive-paths.ts`); maintainer review/approval requested
  on this PR.

---

## Technical Architecture

```
provider snapshot (wagmi)
  └─ resolveProviderStatus → WalletProviderStatus
       └─ planWalletReconnect(provider, connectors, preferredConnectorId)
            ├─ unknown/connecting/reconnecting → idle (never race)
            ├─ connected + bad account       → idle + clearPreference
            ├─ connected + unsupported chain → idle (keep preference)
            ├─ connected + trusted           → idle (provider authoritative)
            ├─ preference missing connector  → idle + clearPreference
            └─ preference matches connector  → connect(connectorId)

useWallet
  ├─ isConnected        = provider connected + valid account + supported chain
  ├─ unsupportedChain   = provider connected + valid account + wrong chain
  └─ persist/clear connector hint from the plan (never from cached identity)

SiweAuthProvider
  ├─ providerSettled    = mounted && !isConnecting && !isReconnecting
  ├─ isAuthenticated    = isSessionBoundToAccount(session, confirmedAccount)
  └─ clears unbound sessions once settled
```

### Security Invariants

- Provider state is the sole source of wallet identity; preferences are hints.
- Fail closed on unsupported chain, malformed/placeholder/zero/Stellar account.
- No fabricated address, chain, connection state, or session.
- Only a connector id is ever persisted — never identity or session material.
- Optimism/EVM only (OP Mainnet + OP Sepolia).

### Dependency note

Depends on **V2-FE-008** (wallet layer). This PR builds on the existing wagmi
provider boundary without introducing new runtime wallet dependencies.

---

## Test Plan

- [x] `pnpm type-check`
- [x] `pnpm test` — 79/79 suites · 767/767 tests
- [x] `pnpm test:a11y` — 3/3 suites · 13/13 tests
- [x] `pnpm build` — artifact verification + production build
- [ ] `pnpm lint` — pre-existing `typescript-eslint`/TS7 breakage on `main`
- [x] Pre-fix verification: the 6 new `useWallet` reconnection tests fail
  against `main`'s `useWallet.ts`; the unsupported-network integration/a11y
  tests also fail against it.

---

## Review Notes

- `useWallet`'s `isConnected` is now chain-aware (fail closed on unsupported
  networks). `useWalletNetwork` remains the dedicated wrong-network surface and
  is unchanged.
- `useSiweAuth` (hook-level, override-friendly) is intentionally untouched; the
  provider-binding enforcement lives in the app-level `SiweAuthProvider`
  boundary. Maintainers may want `useSiweAuth` hardening as a follow-up.
- Wallet/session-sensitive change: human maintainer approval required.
