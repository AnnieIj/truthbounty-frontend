# RPC and API Fallback Boundaries

V2-FE-136 · Complexity: medium · Points: 150

## Purpose

This document defines the UI state model, component boundaries, and
production failure behaviour for RPC and API projection fallback.

## Security invariants

- **Never fabricate** chain state, API projections, or protocol outcomes.
- **Fail closed** on unsupported chains, missing config, or integrity
  uncertainty: no action is presented as available when the system cannot
  verify it is safe.
- **Stale data is always labelled**; it is never silently presented as current.
- **No production mocks**: MSW handlers must never be imported into production
  bundles. All handlers live in `src/__tests__/mocks/`.

## State model

### RPC provider health

| Status | Meaning |
|---|---|
| `healthy` | Provider responding within latency threshold |
| `degraded` | Responding slowly or with intermittent errors |
| `unhealthy` | Consistently failing; circuit open |
| `unknown` | Not yet probed |

### API projection staleness

| Status | Meaning | Blocked? |
|---|---|---|
| `loading` | Initial fetch in progress | No |
| `fresh` | Data within `staleAfterMs` | No |
| `stale` | Data beyond `staleAfterMs` | No |
| `critical` | Data beyond `criticalAfterMs` | **Yes** |
| `error` | Last fetch failed | Depends on data age |
| `unavailable` | No data and no successful fetch ever | **Yes** |

### Chain integrity

| Status | Meaning |
|---|---|
| `valid` | Chain + API state is fresh and consistent |
| `degraded` | One or more sources are stale or on fallback |
| `blocked` | Critical staleness or chain mismatch; write actions blocked |
| `error` | Fatal integrity failure; all actions disabled |

## Circuit breaker defaults

| Parameter | Default |
|---|---|
| `failureThreshold` | 3 consecutive failures |
| `resetAfterMs` | 30 000 ms |
| `probeTimeoutMs` | 5 000 ms |

## Component / hook boundaries

```
<ChainIntegrityGuard>            — evaluates chain + RPC health
  <FallbackBoundary>             — renders degraded banner or blocked overlay
    <YourFeatureComponent />     — always receives children when valid
  </FallbackBoundary>
</ChainIntegrityGuard>
```

## Hooks

### `useRpcFallback(chainId, options)`

- Source: `src/hooks/useRpcFallback.ts`
- Probes all `rpcUrls` for the given chain using `eth_chainId`.
- Rotates to the healthiest provider automatically.
- Opens circuit after `failureThreshold` consecutive failures across all
  providers; returns `activeUrl: null` when circuit is open.

### `useApiWithFallback(options)`

- Source: `src/hooks/useApiWithFallback.ts`
- Wraps a `fetcher` function with retry (exponential backoff), staleness
  tracking, and `isBlocked` flag.
- Sets `isBlocked = true` when status is `critical` or `unavailable`.
- Exposes `reload()` for user-initiated retries.

## Accessible components

| Component | Location | ARIA |
|---|---|---|
| `FallbackBoundary` | `src/components/common/FallbackBoundary.tsx` | `role=status` (degraded), `role=alert` (blocked/error) |
| `ChainIntegrityGuard` | `src/components/common/ChainIntegrityGuard.tsx` | Delegates to FallbackBoundary |
| `RpcStatusIndicator` | `src/components/common/RpcStatusIndicator.tsx` | `role=status`, `aria-label` |
| `ApiStaleBanner` | `src/components/common/ApiStaleBanner.tsx` | `role=status` (stale), `role=alert` (critical/unavailable) |

## Tests

| Suite | File |
|---|---|
| useRpcFallback unit | `src/hooks/__tests__/useRpcFallback.test.ts` |
| useApiWithFallback unit | `src/hooks/__tests__/useApiWithFallback.test.ts` |
| Component tests | `src/components/__tests__/FallbackBoundary.test.tsx` |
| Accessibility tests | `src/components/__tests__/FallbackBoundary.a11y.test.tsx` |
| E2E tests | `e2e/rpc-api-fallback.spec.ts` |

## CI gates

- `lint` — ESLint must pass on all new files.
- `type-check` — `tsc --noEmit` must pass with no errors.
- `test` — All Jest tests must pass without concealed skips.
- `test:a11y` — Accessibility tests must pass.
- `test:e2e` — Playwright E2E tests must pass against canonical mocks.
- `build` — Next.js production build must succeed.

## Non-goals

- Changing smart-contract or backend protocol authority.
- Adding Stellar, Soroana, or alternate-chain runtime support.
- Performing an unrelated product redesign.
