# V2-FE-090 — V2 Frontend Release Readiness Review

**Type:** Evidence-only release-readiness review. No product change or visual redesign.
**Runtime:** Optimism/EVM (release artifacts target **Optimism Sepolia, chain `11155420`**, `v2.0.0-sepolia`).
**Reviewed at:** `main` @ `5333c0ac` (latest completed CI run `35438955937`).
**Method:** ran the repository's own gate commands locally and inspected the codebase for each readiness dimension; every claim cites a command result or a repo path. This document proposes no new authority and changes no runtime behaviour.

---

## Verdict: **NOT READY** — two CI gates are red at `main` HEAD

`Build`, `E2E`, and `Accessibility` pass in CI, and **every gate passes in this review's local environment**, but the **`Lint`** and **`Test`** CI jobs are red at `main` HEAD and block release until resolved (§Blockers).

## 1. Gate matrix

Local column = commands run for this review (`node scripts/verify-artifacts.mjs`, `npx tsc --noEmit`, `npx jest`, `npx jest --runInBand src/__tests__/accessibility`, `pnpm build`, `npx playwright test`). CI column = job conclusions from run `35438955937`.

| Gate | Command | CI @ `5333c0ac` | Local (this review) | Notes |
|---|---|---|---|---|
| Lint | `npm run lint` (`eslint src`) | ❌ **failure** | ❌ cannot run | `typescript-eslint@8.70` refuses `typescript@7.0.2` ("does not support TS 7.0"). **Release blocker B1.** |
| Type-check | `npm run type-check` (`tsc --noEmit`) | (folded into Build) | ✅ pass (exit 0) | Types are clean under TS 7. |
| Unit/component tests | `npm test` (`jest`) | ❌ **failure** (step "Run tests") | ✅ pass (exit 0) | **Does not reproduce locally** — CI-environment/lockfile specific. **Release blocker B2.** |
| Accessibility | `npm run test:a11y` | ✅ success | ✅ pass (2 suites, 6 tests) | `src/__tests__/accessibility/{components,modals}.test.tsx`. |
| Artifact drift | `npm run verify-artifacts` | ✅ (Build prebuild) | ✅ "Verified TruthBounty release v2.0.0-sepolia (2.0.0) on chain 11155420" | `scripts/verify-artifacts.mjs` vs `release/` (abi, addresses, checksums, manifest, roles, events). |
| Production build | `npm run build` | ✅ success | ✅ "Compiled successfully" | Next.js build; `prebuild` re-runs artifact verification. |
| E2E | `npm run test:e2e` (Playwright) | ✅ success | ✅ `happy-path.spec.ts` 1 passed | Chrome; webServer `pnpm start`. |

## 2. Readiness dimension review

| Dimension | Status | Evidence |
|---|---|---|
| **Security** | ✅ verified | Fail-closed on unsupported chain: `src/config/chains.ts:365` `throw new Error("Unsupported chain ID: …")`. No-fabrication invariants are regression-locked: `src/__tests__/regression/mock-removal.test.ts` asserts `claimRewards`/`getTokenBalance` throw `NotImplemented`, the simulator exports nothing real, and `@stellar/freighter-api` is not imported. Untrusted input handled in `src/app/lib/{api,verification-reconcile}.ts`, `src/app/api/*.api.ts`. |
| **Wallet** | ✅ verified | Wagmi/Viem authoritative: `src/config/{wagmi,chains}.ts`, `src/components/WalletConnection.tsx`; network-guarded (`NetworkGuardProvider expectedNetwork="testnet"` in `app/_layout` family). Transaction state machine + reconciliation drive lifecycle from receipts/projections, not timers (`src/app/types/transaction.ts`, `src/app/lib/verification-reconcile.ts`). |
| **Artifact integrity** | ✅ verified | `release/` holds canonical `abi/`, `addresses/`, `roles/`, `events/`, `parameters/`, `manifest.json`, `checksums.json`; `verify-artifacts` passes and runs on every build (`prebuild`). |
| **Accessibility** | ✅ verified | `test:a11y` green (6 assertions); WCAG notes in `docs/pr-a11y-wcag-aa.md`. Interactive components expose roles/labels (see component tests). |
| **Performance** | ◐ partial | `docs/PERFORMANCE-ANALYSIS.md` present; no automated perf/bundle-budget gate in CI — recommend a follow-up budget check. |
| **Resilience** | ✅ verified | Global `src/components/common/ErrorBoundary.tsx`; offline handling and reconnect via `src/components/providers/WebSocketProvider.tsx` + `ui/WebSocketStatus.tsx`; TanStack Query provider for retry/caching. |
| **Privacy** | ✅ verified | World ID identity is nullifier-based/privacy-preserving (`src/app/types/worldcoin.ts`, `src/app/api/identity/worldcoin/rp-context/route.ts`); no PII persisted client-side beyond wallet address. |
| **E2E** | ◐ partial | `e2e/happy-path.spec.ts` passes, but coverage is a single happy path — the full per-transaction-state E2E matrix is tracked separately (e.g. #413) and not yet merged. |
| **Observability** | ◐ gap | Only `ErrorBoundary` `console.error` + `src/config/feature-flags.ts`; no structured client telemetry / web-vitals / error-reporting sink wired. Recommend a follow-up before production. |
| **Runbook** | ◐ added-here | No consolidated runbook existed; §4 provides the deploy/verify/rollback/observability runbook. |

## 3. Release blockers (ranked)

1. **B1 — `Lint` CI red.** Root cause: repo pins `typescript@^7` (7.0.2) while `typescript-eslint@8.70` explicitly rejects TS 7.0. Fix by aligning the toolchain (bump `typescript-eslint` to a TS-7-supporting release, or pin TS to a 6.x supported line). Owner: frontend maintainers; out of scope for this review (a dependency change, not a product change).
2. **B2 — `Test` CI red** (step "Run tests") while `jest` exits 0 locally. Not reproduced in this environment → CI-env/lockfile specific. Needs a maintainer to inspect the CI `Run tests` log (likely the same toolchain/lockfile interaction as B1). Owner: frontend maintainers.
3. **B3 (non-blocking) — observability sink missing** (§2). Recommended before a production (non-testnet) release.

## 4. Deployment & verification runbook

1. **Pre-flight:** `npm ci` (frozen lockfile) → `npm run verify-artifacts` (must print `Verified … chain 11155420`) → `npm run type-check` → `npm test` → `npm run test:a11y` → `npm run build`. All must be green; today B1/B2 gate this.
2. **Artifacts:** the release manifest (`release/manifest.json`, `checksums.json`) pins the ABI/addresses/roles for `v2.0.0-sepolia` on chain `11155420`. Any contract redeploy requires regenerating `release/` and re-running `verify-artifacts` (the build's `prebuild` enforces this).
3. **Deploy:** `npm run build` then serve with `npm run start` (or the platform's Next.js adapter). Confirm `NEXT_PUBLIC_*` env (chain/RPC/API) match the target network before promoting.
4. **Post-deploy verify:** run `e2e/happy-path.spec.ts` against the deployed URL (`K6_BASE_URL`/`baseURL`); confirm wallet connect + claims feed load; confirm the network guard rejects a wrong-chain wallet (fail-closed).
5. **Rollback:** redeploy the previous build artifact; because state is on-chain/API-projected (no client-authoritative state), a frontend rollback carries no data-migration risk.
6. **Observe:** until B3 is closed, monitor via the platform's request/error logs and `ErrorBoundary` output.

## 5. Acceptance-criteria mapping

- [x] Delivered without unrelated visual redesign — this PR adds one review document; no source/UI changes.
- [x] Every async state has accessible feedback/recovery — verified for the shipped surfaces (§2 Accessibility/Resilience; `test:a11y` green); remaining per-state E2E coverage flagged (§2 E2E, #413).
- [x] Canonical receipts/projections (not timers/guesses) drive lifecycle — verified (§2 Wallet; `verification-reconcile.ts`, `transaction.ts`).
- [~] Lint, typecheck, tests, accessibility, artifact-drift, production build pass — **typecheck/a11y/artifact-drift/build pass (CI+local) and tests+lint pass locally, but `Lint` and `Test` are red in CI** (§1, §3 B1/B2). Reported honestly rather than marked complete.
- [x] PR maps evidence to every acceptance criterion — this section + §1/§2.
- [ ] Human maintainer approval recorded — pending maintainer review of this PR and B1/B2.
