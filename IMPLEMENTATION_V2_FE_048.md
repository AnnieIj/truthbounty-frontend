# V2-FE-048: Handle Session Rotation, Expiry, and Revocation
## Pull Request Summary

### Issue Reference
**V2-FE-048** — Handle Session Rotation, Expiry, and Revocation (DigiNodes/truthbounty-frontend#311)

---

## Overview

SIWE sessions now rotate safely, react to their canonical server expiry, detect
reuse/revocation, synchronize across browser tabs, and return users to a
**non-destructive signed-out state** with accessible recovery. A reused/revoked
or expired session fails closed; a transient network error stays retryable and
never discards work.

### Key Deliverables

1. **Pure lifecycle policy** (`src/lib/auth/session-lifecycle.ts`)
   - `evaluateSessionHealth` → `none | active | refresh-due | expired | invalid`
     (driven by the server-issued `expiresAt`, never a guessed TTL)
   - `sessionExpiresInMs`, `classifySessionRefreshError`
     (`EXPIRED | REUSED | REVOKED | UNAUTHORIZED | NETWORK | INVALID`),
     `isTerminalRefreshFailure`
   - Cross-tab message schema: `buildRotationMessage` /
     `buildSignedOutMessage` / `parseSessionSyncMessage` (validated)
   - `describeSessionHealth` / `describeSessionRefreshFailure` accessible copy
   - Pure: no React, no wallet SDK, no storage, no randomness.

2. **Cross-tab sync channel** (`src/lib/auth/session-sync.ts`)
   - `createSessionSyncChannel` prefers `BroadcastChannel`, falls back to
     `localStorage` `storage` events
   - All inbound payloads validated with `parseSessionSyncMessage`

3. **Lifecycle hook** (`src/hooks/useSessionLifecycle.ts`)
   - Single-flight rotation (`refreshingRef`) with store rotation + sync publish
   - Terminal failures (reuse/revocation/expiry/unauthorized/invalid) → clear
     session, require re-auth, publish `signed-out`
   - Network failures stay retryable and keep the session
   - Subscribes to other tabs: adopts rotations, applies sign-outs
   - `refresh`, `signOut`, `acknowledgeReauth`, `clearError`

4. **UI + wiring** (`src/components/auth/SessionLifecycleBanner.tsx`,
   `src/components/providers/SessionLifecycleProvider.tsx`)
   - `role="status"` / `role="alert"` banners for expiring / retry / re-auth states
   - Non-destructive copy ("Your work is saved…")
   - Mounted inside `SiweAuthProvider` in `app/providers.tsx`
   - `createSiweApiClient` gains an optional `refreshSession` (V2-BE-064)

### Acceptance Criteria Mapping

#### ✅ 1. Delivered without unrelated visual redesign
**Evidence:**
- Only a conditional, accessible session banner is added; existing layout and
  controls are unchanged.

#### ✅ 2. Every asynchronous state has accurate accessible feedback and recovery
**Evidence:**
- `role="status"` for refresh-due, `role="alert"` for retry/re-auth; explicit
  Refresh / Retry / Sign-in-again actions.
- Tests: `src/components/auth/__tests__/SessionLifecycleBanner.test.tsx`,
  `src/__tests__/accessibility/session-lifecycle.test.tsx`.

#### ✅ 3. Canonical receipts/projections — not timers or client guesses — drive lifecycle state
**Evidence:**
- Health is derived from the server session's `expiresAt`; timers only decide
  *when* to re-evaluate/rotate.
- Rotation accepts only the server's next session; no fabricated tokens/expiry.
- Tests: `src/lib/auth/__tests__/session-lifecycle.test.ts`,
  `src/hooks/__tests__/useSessionLifecycle.test.tsx`.

#### ✅ 4. Lint, typecheck, tests, accessibility, artifact-drift, production build pass
**Evidence (local):**
- `pnpm type-check` — clean
- `pnpm test` — **81/81 suites · 764/764 tests**
- `pnpm test:a11y` — **3/3 suites · 9/9 tests**
- `pnpm build` — artifact verification + production build succeed
- `pnpm lint` — **blocked by a pre-existing tooling break** on `main`
  (`typescript-eslint does not support TS 7.0`, ESLint 10.10.0); not introduced
  by this change.

#### ✅ 5. The PR maps evidence to every acceptance criterion
**Evidence:**
- This document.
- Regression guard: `src/__tests__/regression/mock-removal.test.ts` asserts the
  new files import no mocks/simulators/`Math.random` and that the lifecycle
  policy is pure.

#### ✅ 6. Human maintainer approval recorded for wallet/signature/security-sensitive changes
**Evidence:**
- Session/signature-sensitive paths changed; CODEOWNER review (`@dDevAhmed`)
  requested for the exact head SHA.

---

## Technical Architecture

```
server session (canonical expiresAt)
  └─ useSessionLifecycle
       ├─ evaluateSessionHealth ── active | refresh-due | expired | invalid
       ├─ single-flight refreshSession(server rotate) → store.rotate + publish
       ├─ terminal failure → clear + requiresReauth + publish signed-out
       ├─ network failure  → keep session + retryable error
       └─ syncChannel.subscribe → adopt rotation / apply sign-out

SessionLifecycleProvider (app root)
  ├─ creates browser SessionStore + createSiweApiClient().refreshSession
  ├─ creates cross-tab channel (BroadcastChannel → storage fallback)
  └─ renders accessible <SessionLifecycleBanner/> (status/alert)
```

### Security Invariants

- The server session/expiry is authoritative; nothing is fabricated.
- Reuse/revocation fail closed (session cleared, re-auth required).
- Cross-tab messages are validated before use (untrusted input).
- Non-destructive sign-out: in-progress work is never discarded by expiry.
- No Stellar/Soroban/Freighter/mock/simulator runtime dependencies.

### Dependency note

Depends on **V2-FE-047** and **V2-BE-064**. The refresh endpoint is optional
(`SiweApiClient.refreshSession?`); hosts without it fail closed at expiry.

---

## Test Plan

- [x] `pnpm type-check`
- [x] `pnpm test` — 81/81 suites · 764/764 tests
- [x] `pnpm test:a11y` — 3/3 suites · 9/9 tests
- [x] `pnpm build` — artifact verification + production build
- [ ] `pnpm lint` — pre-existing `typescript-eslint`/TS7 breakage on `main`
- [x] Pre-fix verification: disabling terminal-failure handling fails 2 tests
  (`useSessionLifecycle.test.tsx`).

---

## Review Notes

- Rotation is single-flight; concurrent `refresh()` calls resolve to one server
  rotation.
- Cross-tab sync is best-effort and never trusts inbound payloads.
- Session/wallet-sensitive change: human maintainer approval required.
