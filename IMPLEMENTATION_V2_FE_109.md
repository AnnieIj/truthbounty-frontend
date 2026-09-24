# V2-FE-109 — Stabilize Claim Search, Filtering, and Pagination

## Pull Request Summary

### Issue Reference
**V2-FE-109** — Stabilize Claim Search, Filtering, and Pagination (V2 frontend work item, independently reviewable)

---

## Overview

This PR replaces the claims table's hardcoded mock-data path with a canonical, validated read path against the claims API projection. The table now renders **only** server-owned state, with explicit loading, ready, ready-stale, empty, and error states, server-side filtering, debounced search, and true pagination — no fabricated rows, totals, confidence scores, or timestamps.

**Before:** `ActiveClaimsTable` imported `activeClaims` from `src/data/mock-data.ts` and filtered/sliced client-side. Three mock rows, no pagination, `fetchClaimsByStatus` blindly cast `res.json()` to `Claim[]`.

**After:** a single canonical projection pipeline with fail-closed parsing and a state machine the UI renders from.

### Key Deliverables

1. **Projection Types** (`src/app/types/claim-list.ts`)
   - `ClaimsListParams` — search + filters (canonical statuses only) + pagination + sort
   - `ClaimsListEnvelope` — `items`, server-owned `pagination` (page/pageSize/total/totalPages), and `projection` freshness metadata (`fresh` | `stale` | `degraded`, `generatedAt`, `reason`)
   - `ClaimListItem` — row shape with `confidenceScore: number | null` (null = not yet scored; never invented)
   - `ClaimsListError` / `ClaimsListErrorCode` — `PROJECTION_UNAVAILABLE`, `PROJECTION_MALFORMED`, `PROJECTION_STALE`, `UNSUPPORTED_REQUEST`, `UNKNOWN`
   - `ClaimsListViewState` — `loading | ready | ready-stale | empty | error`
   - `validateClaimsListParams`, `isClaimListItem` — fail-closed validation (unknown status filters rejected, pagination bounds 1–100)

2. **Validated Fetch** (`src/app/api/claims.api.ts`)
   - `fetchClaimsList(params, signal)` — canonical querystring (`buildClaimsListQuery`), abort-signal aware (AbortError passes through for React Query cancellation)
   - Fail-closed envelope parsing: non-JSON, missing/malformed rows, bad pagination blocks, or invalid freshness metadata throw `PROJECTION_MALFORMED`; 400/422 → `UNSUPPORTED_REQUEST`; 503 → `PROJECTION_STALE`; network failure → `PROJECTION_UNAVAILABLE`
   - Pagination clamped before the wire; totals always server-owned

3. **State Hook** (`src/hooks/useClaimsList.ts`)
   - Maps React Query lifecycle onto the explicit view state; `keepPreviousData` keeps the previous page rendered during transitions (no spinner collapse between pages); stale projections (server-reported or older than `staleAfterMs`, default 60s) surface as `ready-stale`
   - Retry policy: transient `PROJECTION_UNAVAILABLE`/`UNKNOWN` retried twice; `PROJECTION_MALFORMED` never retried (integrity failures do not heal on retry)
   - Invalid params fail closed with `UNSUPPORTED_REQUEST` — never reach the wire

4. **UI Rework** (`src/components/features/ActiveClaimsTable.tsx`)
   - Same visual language (no redesign): filter chips, search input with clear button, table, dark theme tokens
   - Debounced search (250ms), canonical status filter chips (OPEN / UNDER_REVIEW / VERIFIED / DISPUTED / High Impact), server pagination with `Previous/Next`, ellipsized page window, and "Showing X–Y of Z" summary
   - Every documented state rendered: loading skeleton, ready, stale banner (server reason + relative age), filtered-empty ("Clear filters" action), indexed-empty, recoverable error (canonical code + "Try again"), unscored confidence as em-dash
   - View links navigate to the existing `/claims/[id]` route; `src/data/mock-data.ts` no longer referenced here

5. **Helpers** (`src/app/lib/format.ts`)
   - `getPaginationWindow(current, total)` — deterministic `[1, …, window ±1, …, total]` with `null` ellipses
   - `formatRelativeAge(iso, now?)` — honest relative timestamps ("just now", "5m ago", …); unparsable input renders `—`, never a fabricated duration

6. **Query Keys** (`src/app/queries/queryKeys.ts`)
   - `claims.list(params)` added; per-param keys keep pages cached independently. Existing `claims.all`, `claims.detail`, `claims.byStatus` untouched.

---

## UI State Model

| State | Trigger | Rendered As |
|---|---|---|
| `loading` | First fetch, no data | `ActiveClaimsTableSkeleton` |
| `ready` | Validated envelope, fresh, non-empty | Rows + pagination |
| `ready-stale` | Server `stale`/`degraded` freshness **or** projection older than `staleAfterMs` | Rows + amber staleness banner (reason + age) |
| `empty` | Validated envelope, zero rows | Filtered: "No claims match…" + Clear filters; unfiltered: "No claims have been indexed yet" |
| `error` | `PROJECTION_UNAVAILABLE`, `PROJECTION_MALFORMED`, `UNSUPPORTED_REQUEST`, unknown | Alert with canonical code + Try again |

The hook never invents rows/totals; components never branch on React Query internals.

## Security & Architecture Compliance

- **Optimism/EVM only** — no Stellar/Soroban/Freighter code added; no alternate-chain runtime.
- **API is projection/read layer** — the claims list only reads; all protocol mutation remains contract-authoritative (unchanged).
- **Never fabricate protocol state** — totals from the server envelope; unscored confidence renders as em-dash; stale data explicitly labeled; errors carry canonical codes. No mock/placeholder addresses, secrets, or unsafe HTML (`dangerouslySetInnerHTML` not used).
- **Fail closed** — malformed projections, unknown status filters, and invalid pagination never render as success.
- **No transaction/credential paths touched** — no wallet/signature/settlement code modified, so no wallet-approval scope is triggered beyond standard frontend review.

## Test Coverage

Unit/component/a11y tests (Jest + RTL + jest-axe), all deterministic (no network, jsdom-safe Response mocks):

- `claims.api.test.ts` (13) — querystring format, clamping, 400/503/500 mapping, network failure, AbortError passthrough, non-JSON, malformed rows/pagination/freshness, signal propagation
- `claim-list.helpers.test.ts` (19) — pagination window edges (tight start/end, ellipses, clamping, degenerate inputs), relative age (minutes/hours/days, future clamping, placeholders), param validation, row type guard (boundary + malformed)
- `useClaimsList.test.tsx` (11) — loading→ready, empty, server-stale, age-stale, malformed→error with code, network→error, invalid params never hit the wire, per-param query keys
- `ActiveClaimsTable.test.tsx` (17) — canonical rows, em-dash unscored confidence, querystring correctness (search + filter + page), debounce, server pagination + range label, boundary-disabled Previous/Next, `aria-current`, filtered vs indexed empty, recoverable error + Try again, stale banner with server reason, live-region announcements, aria-pressed chips, accessible names
- `active-claims-search-clear.test.tsx` (updated, 6) — pre-existing clear-button invariants preserved against the canonical data path (hidden when empty, appears on input, clears + restores focus, empty states, `type="button"`)
- `claims-list.a11y.test.tsx` (5, runs in `pnpm test:a11y`) — jest-axe clean for loading/ready/stale/empty/error states

**Total: 71 new/updated tests.** Full suite: **83 suites, 796 tests, all passing.**

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| Type check | `pnpm type-check` (`tsc --noEmit`) | ✅ Pass |
| Tests | `pnpm test` | ✅ 796/796 (83 suites) |
| Accessibility | `pnpm test -- --testPathPatterns claims-list.a11y` | ✅ 5/5, no axe violations |
| Lint | `pnpm lint` | ⚠️ Pre-existing failure — `typescript-eslint@8.70` does not support the installed `typescript@7.0.2`; fails identically on a clean tree (`git stash` verified). Unrelated to this PR. |
| Production build | `pnpm build` | Not run here; `prebuild` runs `verify-artifacts` and typecheck passes. Recommend maintainer CI run. |

Baseline drift note: a Jest-30 test run rewrites `StatsCards.test.tsx.snap`'s header comment (`goo.gl/fbAQLP` → `jestjs.io/docs/snapshot-testing`). Reverted to keep the diff clean.

## Files Changed

**New**
- `src/app/types/claim-list.ts`
- `src/hooks/useClaimsList.ts`
- `src/hooks/__tests__/claim-list-fixtures.ts`
- `src/hooks/__tests__/claims.api.test.ts`
- `src/hooks/__tests__/claim-list.helpers.test.ts`
- `src/hooks/__tests__/useClaimsList.test.tsx`
- `src/components/features/__tests__/ActiveClaimsTable.test.tsx`
- `src/__tests__/accessibility/claims-list.a11y.test.tsx`
- `IMPLEMENTATION_V2_FE_109.md` (this file)

**Modified**
- `src/app/api/claims.api.ts` — added `buildClaimsListQuery`, `fetchClaimsList` (fail-closed); existing functions untouched
- `src/components/features/ActiveClaimsTable.tsx` — canonical data path + pagination + explicit states; same visual language
- `src/app/lib/format.ts` — added `getPaginationWindow`, `formatRelativeAge`
- `src/app/queries/queryKeys.ts` — added `claims.list(params)`
- `src/__tests__/components/active-claims-search-clear.test.tsx` — preserved invariants, adapted to async projection rendering

**Removed**: `ActiveClaimsTable`'s import of `src/data/mock-data.ts` (`activeClaims`). The mock file itself is untouched and still used by other stories/components.

## Acceptance Criteria Mapping

- ✅ **UI reflects canonical chain/API state, never invents outcomes** — validated envelope only; server-owned totals/freshness; unscored → em-dash; stale labeled
- ✅ **Required states accessible, responsive, deterministic, recoverable** — all five states rendered + jest-axe clean; `aria-live` announcements; Try again / Clear filters recovery; responsive flex layouts preserved
- ✅ **Required tests execute in CI and pass without concealed skips** — lint/test/build/a11y jobs pick these suites up via existing `testMatch`; zero `.skip`/`.todo`
- ✅ **Documentation synchronized** — this file plus inline JSDoc on every export
- ✅ **No unrelated issue closed / no unrelated redesign** — no visual redesign, no layout changes outside the table, no GitHub admin actions
- ✅ **Maintainer approval** — no wallet/signature/transaction/settlement paths modified; standard frontend review applies

## Dependencies (V2-FE-108)

This task depends on referenced API/contract interfaces being canonical. The list read path here is intentionally narrow (claims projection only); it consumes the documented `/api/claims` projection contract and adds no new backend surface. If V2-FE-108's canonical endpoints differ in shape, the only files to touch are `claim-list.ts` (types) and `fetchClaimsList` (parsing) — the hook, component, and tests are insulated from wire-format changes by the envelope validation.

## Non-Goals

- No smart-contract or backend protocol authority changes
- No alternate-chain runtime support
- No product redesign (table layout/classes preserved; only data source and states changed)
- No contributor-assignment or label changes

## Residual Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `/api/claims` may not yet return the envelope shape server-side | Medium | Fail-closed parsing surfaces `PROJECTION_MALFORMED` with a visible, recoverable error rather than rendering wrong data; envelope type is the single adaptation point |
| 60s `staleAfterMs` may need tuning per deployment | Low | Exposed as `staleAfterMs` option and `CLAIMS_LIST_DEFAULTS` constant |
| Debounce (250ms) is not configurable per-callsite | Low | Centralized in `CLAIMS_LIST_DEFAULTS.debounceMs` |

## Next Steps

1. Align the `/api/claims` backend route with the envelope contract (or wire `NEXT_PUBLIC_API_URL` to the canonical indexer projection)
2. Real-indexer E2E run (`pnpm test:e2e`) once staging projections are available
3. Maintainer CI run for lint (once the TS7/toolchain pin is resolved) and production build
