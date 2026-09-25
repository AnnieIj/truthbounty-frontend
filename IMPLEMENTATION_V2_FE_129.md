# V2-FE-129: Low-Bandwidth and Offline Read Resilience
## Pull Request Summary

### Issue Reference
**V2-FE-129** — Support Low-Bandwidth and Offline Read Resilience ([#396](https://github.com/DigiNodes/truthbounty-frontend/issues/396))

---

## Overview

Adds browser connectivity awareness and resilient **read** paths so the UI degrades safely when offline or on constrained links, without inventing protocol outcomes.

### Key Deliverables

1. **`useNetworkStatus` hook** (`src/hooks/useNetworkStatus.ts`)
   - Tracks `navigator.onLine` via `online`/`offline` events
   - Reads Network Information API (`saveData`, `effectiveType`) when available
   - Exposes `isLowBandwidth` for data-saver / 2g / 3g / slow-2g

2. **`OfflineBanner`** (`src/components/ui/OfflineBanner.tsx`)
   - Global `role="status"` / `aria-live="polite"` notice
   - Offline copy and low-bandwidth/data-saver copy (centralized in `src/lib/network-copy.ts`)
   - Mounted in `MainLayout` beside `TrustWarningBanner`

3. **Query client hardening** (`src/app/queries/queryClient.ts`)
   - `networkMode: 'online'` — reads pause instead of spinning retries offline
   - `refetchOnReconnect: true` — auto-heal when connectivity returns
   - Retry skips while `navigator.onLine === false`; exponential backoff capped at 30s
   - Longer `staleTime` when save-data/slow connection is reported at startup

4. **Dashboard read states** (`src/app/(dashboard)/page.tsx`)
   - Skeleton only for a true first load (not infinite when fetch is paused offline)
   - Offline empty state when paused with no cache
   - Error + Retry when a read fails with no cache
   - Cached data + offline/stale notice when refresh fails or network is offline
   - Never fabricates claims or protocol outcomes

5. **ErrorBoundary** mounted in `Providers` (`src/app/providers.tsx`) so render failures degrade to a retry UI

### Acceptance Criteria Mapping

#### ✅ UI reflects canonical chain/API state and never invents protocol outcomes
- Dashboard only renders `useClaims()` data (or explicit empty/error/offline UI)
- Offline copy states that nothing is fabricated until reconnect

#### ✅ Required states are accessible, responsive, deterministic, recoverable
- Banner: `role="status"`, `aria-live="polite"`, icon + text (not color alone)
- Notices include explicit Retry buttons calling `refetch()`
- Covered by `pnpm test:a11y` (OfflineBanner axe test) and unit/integration tests

#### ✅ Required tests execute in CI without concealed skips
- `src/hooks/__tests__/useNetworkStatus.test.tsx`
- `src/components/ui/__tests__/OfflineBanner.test.tsx`
- `src/app/queries/__tests__/queryClient.test.ts`
- `src/__tests__/integration/offline-read-resilience.test.tsx`
- `src/__tests__/accessibility/components.test.tsx` (OfflineBanner)

#### ✅ Canonical artifacts, documentation, and telemetry rules synchronized
- Read-only change; no contract writes, calldata, or secrets
- No new production mocks or placeholder addresses

#### ✅ No unrelated issue closed / no unrelated redesign
- Scope limited to offline/low-bandwidth read resilience (one V2-FE issue per PR)

#### ⏳ Independent human maintainer approval of head SHA
- Required on the PR before merge (per issue)

### Explicit Non-Goals (recorded)

- Service worker / offline shell — deferred in `docs/ARCHITECTURE.md` and `docs/PERFORMANCE-ANALYSIS.md` (Phase 3)
- Full i18n framework — strings centralized in `src/lib/network-copy.ts` for later localization
- Offline mutation queueing — writes still fail closed when offline (`networkMode: 'online'` on mutations)

### Validation

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm test:a11y
pnpm build
```

### Test plan

- [ ] `pnpm lint`
- [ ] `pnpm type-check`
- [ ] `pnpm test`
- [ ] `pnpm test:a11y`
- [ ] `pnpm build`
