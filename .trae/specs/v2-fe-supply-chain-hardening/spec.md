# TruthBounty V2 Frontend — Supply Chain & Dependency Hardening

## Overview
- **Summary**: Independently reviewable V2 frontend work item hardening browser security, privacy, degraded-state behavior, and production integrity for the TruthBounty Optimism/EVM client.
- **Purpose**: Ensure the user-facing client reflects canonical chain/API projection state accurately, constructs valid user-authorized transactions only, makes uncertainty visible, and never fabricates transaction success, settlement, rewards, reputation, or protocol state — while protecting end users from XSS, dependency tampering, artifact drift, and configuration regressions.
- **Target Users**: End users (claim submitters, verifiers, treasury holders), maintainers merging wallet/transaction/security-sensitive PRs, and CI release gates.

## Goals
- Browser security posture is explicit, fail-closed, and auditable: CSP, security headers, no unsafe HTML, hardened external links, CSP-nonced inline scripts.
- Production bundle integrity: no mocks, no Stellar/Freighter runtime, no placeholder addresses/secrets, artifact checksum + manifest + chain-id verified before build and in CI.
- Dependency supply chain: frozen lockfile installs, dependency-audit gate, known-vulnerability blocking, drift regression tests for lifecycle modules.
- Transaction/chain states (loading, empty, stale, rejected, failed, pending, confirmed, finalized, reorged, configurationError) are accessible, responsive, deterministic, and recoverable — with invariants already in `TRANSACTION_STATE_MODEL.md` enforced by additional test coverage.
- CI evidence gates: lint, typecheck, unit/component, accessibility, E2E, dependency/security, artifact-drift, and production-smoke all execute with pass/fail outcomes and no concealed skips.
- Secrets/telemetry redaction: no `NEXT_PUBLIC_` leaks of private material; structured test ensuring environment exposure matches the public schema only.

## Non-Goals
- Changing smart-contract or backend protocol authority.
- Adding alternate-chain runtime support (Stellar, Soroban, Freighter, other EVMs beyond canonical Optimism 10/11155420).
- Performing an unrelated product redesign or UX overhaul.
- Activating contributor assignment before maintainers apply Stellar Wave (process-only; out of scope).

## Background & Context
The codebase already contains substantial V2 security primitives:
- Release artifact verification (prebuild) in [verify-artifacts.mjs](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/scripts/verify-artifacts.mjs) and [load-artifacts.ts](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/src/lib/contracts/load-artifacts.ts).
- Address guard / placeholder / Stellar rejection in [address-guard.ts](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/src/lib/contracts/address-guard.ts).
- Evidence sanitizer, URL scheme allowlist, rel/target hardening in [evidence-sanitizer.ts](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/src/lib/security/evidence-sanitizer.ts).
- Wallet provider config guard in [config-guard.ts](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/src/lib/wallet-boundary/config-guard.ts).
- Runtime validator in [runtime-validator.ts](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/src/lib/config/runtime-validator.ts).
- Transaction state machine and UX state model in [transaction-machine.ts](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/src/lib/transaction-machine/transaction-machine.ts) and [TRANSACTION_STATE_MODEL.md](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/docs/ux/TRANSACTION_STATE_MODEL.md).
- ChainIntegrityGuard + FallbackBoundary, ProtocolContractBoundary, ReorgBanner.
- Regression guards: production-mock-isolation, stellar-freighter-removal, sensitive-paths, artifact-drift.
- CI jobs: lint, test, build (verify-artifacts, type-check), accessibility, E2E in [ci.yml](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/.github/workflows/ci.yml).

Open gaps discovered during Specify exploration (detailed in Functional Requirements):
1. `next.config.ts` exports no security headers (CSP, frame-options, nosniff, referrer-policy, permissions-policy) — leaves the client without a browser-enforced XSS/clickjacking policy.
2. `ThemeInitScript` accepts a `nonce` prop but nothing injects/generates one; the script is currently `dangerouslySetInnerHTML` without CSP-hash or nonce anchoring, so a strict CSP would break theme initialization.
3. No CI dependency-audit gate (no `pnpm audit --prod` or `audit-ci`). Dependabot runs weekly but does not block merge on known advisories.
4. No CI secret/pattern leak scan (private keys, API keys, WalletConnect prod IDs, worldcoin RP context JSON).
5. `artifact-drift.test.ts` hardcodes 4 specific source files; no comprehensive regression that all lifecycle modules avoid placeholder/fabrication tokens.
6. No explicit lockfile-integrity CI assertion beyond `--frozen-lockfile` (e.g., a `git diff --exit-code pnpm-lock.yaml` after install check).
7. No SafeExternalLink usage regression; `SafeExternalLink.tsx` exists but no test verifies every production `target="_blank"` uses hardened `rel` via the component.
8. No explicit telemetry/redaction rule module or test — acceptance criteria reference synchronized telemetry/redaction rules.
9. No explicit test covering every documented user-visible failure state (rejected, reverted, dropped, replaced, reorged, configurationError, stale, degraded) with accessibility assertions (role="alert", aria-live, keyboard reachability) in a single cohesive battery.

## Functional Requirements
- **FR-1 (Security Headers)**: `next.config.ts` or equivalent middleware sets production-grade HTTP response headers: `Content-Security-Policy` (strict default-src, script-src with nonce/self + trusted origins only, style-src self/nonce, img-src self https ipfs data, connect-src self + RPC/API/WSS allowlist, frame-ancestors none, object-src none, base-uri none, form-action self), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation=()), `X-Frame-Options: DENY` via CSP frame-ancestors. Development may relax for Storybook/HMR but production is strict.
- **FR-2 (CSP Nonce Injection)**: Every inline `<script>` (notably `ThemeInitScript`) is anchored by a server-generated per-request nonce. The nonce is generated in middleware/root layout, passed to the script, and reflected in the CSP header. No `unsafe-inline` in script-src in production.
- **FR-3 (Dependency Audit Gate)**: CI workflow `ci.yml` adds a `dependency-security` job that runs `pnpm audit --prod` (or equivalent) and fails the workflow on `high` or `critical` advisories. A documented allowlist for known false positives is maintained as a version-controlled JSON file consumed by the gate.
- **FR-4 (Secrets Leak Detection)**: CI workflow `ci.yml` adds a `secret-scan` job that scans source, `release/`, and build output for high-entropy secrets and known patterns (EVM private keys `0x[0-9a-fA-F]{64}`, API key shaped tokens, `NEXT_PUBLIC_*` values that contain secret-like content, walletconnect project-id placeholder patterns not matching the dev-only default). The scan fails on matches except for explicitly allowlisted test fixtures.
- **FR-5 (Comprehensive Artifact-Drift Regression)**: A single jest regression test enumerates all production (non-test, non-storybook, non-mock) source files and asserts the absence of: Stellar/Freighter runtime tokens, MSW/mock-wagmi imports, placeholder addresses (`0xYourContract`), low-entropy dummy `0x00…00`/`0x11…11` addresses, fabricated-hash generators (`Math.random`, `crypto.randomUUID` used for tx hashes), setTimeout-based success transitions, and `dangerouslySetInnerHTML` outside the allowlisted `ThemeInitScript` module.
- **FR-6 (Safe External Link Regression)**: A jest regression test enumerates all production `.tsx` sources, finds every JSX `<a target="_blank"` or equivalent, and asserts either (a) the component is `SafeExternalLink` or (b) it has a static `rel` attribute containing both `noopener` and `noreferrer` via `isHardenedRel`.
- **FR-7 (Telemetry / Redaction Rules)**: A new module `src/lib/security/redaction.ts` implements structured redaction: given an arbitrary object/error/tx payload it strips signature blobs, raw calldata longer than 10 hex chars, private-key-shaped strings, and any key named `token`, `secret`, `authorization`, `privateKey`, `password` before it is logged or sent to an error boundary. An accompanying test verifies redaction correctness on realistic fixtures. This module is wired into global-error, error boundaries, and any console/error reporters so the public contract is "nothing private leaves the browser."
- **FR-8 (State Coverage + Accessibility Tests)**: The existing accessibility test battery adds a cohesive `src/__tests__/accessibility/degraded-state-ux.test.tsx` that renders each of the required UX states (loading/skeleton, empty, stale, rejected, failed, pending/submitted, confirming, confirmed but not safe, finalized, reorged, configurationError/chain-unsupported, degraded/RPC-fallback) through their canonical components and asserts: (a) an accessible live-region or status role announces the state; (b) focus is preserved or moved to a reachable control after failure; (c) retry controls are keyboard reachable; (d) WCAG AA contrast for the banner text on its background; (e) reduced-motion disables any spinner animation.
- **FR-9 (Lockfile Integrity Gate)**: The build CI job asserts the lockfile is unchanged after install + build steps using a tracked checksum or `git diff --exit-code pnpm-lock.yaml` to catch CI-time dependency drift.
- **FR-10 (Public Env Leakage Test)**: A jest test enumerates all `process.env.*` references reachable from production client modules (via a file walk + regex) and asserts every referenced key begins with `NEXT_PUBLIC_` or is guarded by `isBrowser() === false` + server-only import boundary. Server env (`getServerEnv`) must throw in browser context — this invariant already exists and is re-verified with a stronger assertion covering any new key added in the future.
- **FR-11 (Maintainer Sign-off Checkpoint)**: The PR guardian workflow records whether the exact head SHA of any PR touching `src/lib/contracts/*`, `src/lib/security/*`, `src/lib/wallet-boundary/*`, `src/hooks/use*Transaction*.ts`, `src/components/transactions/*`, `src/components/protocol/*`, or `release/**` has an approving review by a CODEOWNERS entry in `.github/CODEOWNERS` matching `* @truthbounty/v2-maintainers`. The gate fails and annotates the PR otherwise.

## Non-Functional Requirements
- **NFR-1 (Optimism/EVM Only)**: No runtime code path imports or references Stellar SDK, Freighter API, Soroban, or non-Optimism chain connectors. Existing `stellar-freighter-removal.test.ts` continues to pass; new tokens in FORBIDDEN_TOKENS are added for any new names.
- **NFR-2 (Contracts Authoritative)**: UI never constructs a transaction hash, receipt, confirmation count, reward amount, or reputation score locally. All protocol mutation outcomes flow from wagmi/viem wallet submission → canonical receipt → canonical indexer projection. `assertNoFabricatedData` in [transaction-state.ts](file:///c:/Users/EMMA/Desktop/truthbounty-frontend/src/lib/transaction-state.ts#L376-L402) is called before any success UI renders.
- **NFR-3 (Fail Closed)**: Unsupported chains, missing configuration, stale critical data, or integrity uncertainty disable protocol mutation buttons and render an explicit banner; no silent degradation.
- **NFR-4 (No Production Mocks / Placeholders)**: Production bundle (`.next/**`) must not contain MSW, mock-wagmi, transaction-simulator exports with function behavior, placeholder addresses, or admin bypass flags.
- **NFR-5 (No Concealed Skips in CI)**: Every required test job in `ci.yml` must exit non-zero on failure; no `.skip`, no `xit`, no `if: always()` wrapping that swallows failures.
- **NFR-6 (Determinism and Recoverability)**: For every failure state in the transaction UX model, a deterministic retry/reset path exists and forms preserve user-authored content across wallet rejections and RPC errors (already documented; tests added in FR-8).

## Constraints
- **Technical**:
  - Browser target only; Optimism Mainnet (10) + Optimism Sepolia (11155420) only.
  - Next.js 16 App Router; security headers must work on Vercel and self-hosted Node start.
  - Use viem/wagmi/RainbowKit for wallet; do not introduce additional chain-lib dependencies.
  - Allowed inline `dangerouslySetInnerHTML`: only `ThemeInitScript` in `src/lib/theme-init.tsx`, and it must carry a nonce.
  - CSP must not require `unsafe-inline` for scripts in production.
- **Business**:
  - Release artifacts under `release/` are single source of truth for addresses/ABI/parameters; edits there trigger artifact-drift and checksum re-verification.
  - Maintainer approval (CODEOWNERS) is required for security/wallet/transaction-sensitive files before merge.
- **Dependencies**:
  - V2-FE-138 (referenced API and contract interfaces canonical); existing release manifest/ABI/addresses must not be changed by this task.
  - `jest`, `playwright`, `@storybook/addon-a11y`, `eslint-plugin-jsx-a11y` are available; avoid new runtime dependencies.

## Assumptions
- A single per-request CSP nonce generated in Next.js middleware or root layout (`generateMetadata`/`headers` API) is the chosen nonce strategy; `strict-dynamic` is not required.
- For dependency auditing, `pnpm audit` output is sufficient; an allowlist JSON file at `.github/dependency-audit-allowlist.json` with `{ advisories: [{ id, reason, expiresAt }] }` covers false positives.
- For secret scanning, a simple regex + entropy check in a Node script (no external SaaS) is acceptable; typical patterns for `0x`-prefixed 64-hex private keys, `sk_`/`pk_`-prefixed keys, and suspicious `NEXT_PUBLIC_` values.

## Acceptance Criteria

### AC-1: Browser enforces production CSP without unsafe-inline scripts
- **Type**: `rule`
- **Given**: A production build started with `NODE_ENV=production`
- **When**: The app HTTP response is inspected (via Playwright or curl against the built Next server)
- **Then**: The `content-security-policy` header is present; `script-src` does not contain `unsafe-inline`; `frame-ancestors` is `'none'`; `object-src` is `'none'`; `base-uri` is `'none'`; inline `ThemeInitScript` carries a `nonce-` value and the header reflects the same nonce value
- **Pass Condition**: Playwright E2E test `e2e/security-headers.spec.ts` asserts the header values and loads the app without CSP violations reported in `browser_console_messages`
- **Evidence**: Playwright test output + CI green run for the new `e2e` matrix entry or separate job

### AC-2: Dependency high/critical advisories block CI
- **Type**: `rule`
- **Given**: CI runs for a PR or push to main
- **When**: The `dependency-security` job executes
- **Then**: If `pnpm audit --prod` reports any advisory with severity ≥ high (not allowlisted in `.github/dependency-audit-allowlist.json`), the job and workflow fail
- **Pass Condition**: CI yaml contains the job, allowlist file exists with documented schema, a simulated "injected bad advisory" unit test proves the gate fails, and the real-world run passes on current lockfile
- **Evidence**: CI yaml diff, allowlist file, passing CI run

### AC-3: Secret patterns in production source fail CI
- **Type**: `rule`
- **Given**: CI runs for a PR or push to main
- **When**: The `secret-scan` job executes against `src/`, `release/`, and build output
- **Then**: Any occurrence of a 0x-prefixed 64-hex private key literal, a `sk_live_` shaped token, or a `NEXT_PUBLIC_WORLDCOIN_APP_ID` value containing `private`/`secret` keywords causes the job to fail, EXCEPT for allowlisted test fixtures tagged with `// eslint-disable-next-line` + an explicit secret-scan allowlist comment
- **Pass Condition**: CI job added, scan script present at `scripts/secret-scan.mjs`, a negative test in `scripts/__tests__/secret-scan.test.mjs` plants a known bad key and asserts non-zero exit, production run passes
- **Evidence**: Script + tests + CI green run

### AC-4: No production code uses mocks, placeholders, alternate chains, or unsafe HTML (comprehensive drift regression)
- **Type**: `rule`
- **Given**: The `artifact-drift` jest test suite
- **When**: It runs against every production source file (exclude `__tests__`, `stories`, `data/mock-data.ts`)
- **Then**: The comprehensive drift test finds 0 matches for all forbidden tokens; AND every `dangerouslySetInnerHTML` occurrence is in `src/lib/theme-init.tsx` (the single allowlisted module)
- **Pass Condition**: New comprehensive test at `src/__tests__/regression/comprehensive-artifact-drift.test.ts` exists, walks `src/` using the same walker as production-mock-isolation, passes without exclusions beyond the documented allowlist
- **Evidence**: Jest green run for the new test, coverage report confirming the walk touches > 50 production source files

### AC-5: Every external target="_blank" link is hardened
- **Type**: `rule`
- **Given**: All production `.tsx` files under `src/`
- **When**: The SafeExternalLink regression test parses each file's AST (or conservative regex) looking for `<a target="_blank"` or `target: "_blank"` props
- **Then**: Each match either renders `<SafeExternalLink>` or has a static `rel` attribute that passes `isHardenedRel` (contains both `noopener` and `noreferrer`)
- **Pass Condition**: New test at `src/__tests__/regression/external-links-hardened.test.ts` passes; if any existing file violates, the component is fixed in this task before the test passes
- **Evidence**: Jest green run; file diffs showing fixes (if any)

### AC-6: Sensitive data is redacted before leaving the browser
- **Type**: `rule`
- **Given**: `src/lib/security/redaction.ts` module and tests
- **When**: It is given an object containing `privateKey`, `authorization: Bearer ...`, a 65-hex signature blob, raw calldata > 20 chars, or a `token` key
- **Then**: The returned object has those values replaced with `'[REDACTED]'`; non-sensitive keys (like `chainId`, `blockNumber`, `txHash`, `reason`) are preserved verbatim; and wiring in `global-error.tsx`, the ErrorBoundary, and console.error wrappers actually calls the redactor before emitting/logging
- **Pass Condition**: Unit tests for each case pass; integration-level test in error-boundaries accessibility test confirms a thrown private-key payload does not appear in the rendered DOM text or console output
- **Evidence**: Redaction module + jest tests + integration tests passing

### AC-7: Every documented user-visible state is accessible and recoverable
- **Type**: `rule`
- **Given**: The new accessibility test battery `src/__tests__/accessibility/degraded-state-ux.test.tsx`
- **When**: Each state (loading/skeleton, empty, stale, rejected, failed, pending, confirming, confirmed-not-safe, finalized, reorged, configurationError, degraded/RPC-fallback) is rendered through its canonical component
- **Then**: axe scan has no violations at WCAG AA; a `role="status"` or `role="alert"` live region announces the state change; retry/reset controls are tab-reachable and have descriptive labels; contrast for banners meets AA; when reduced-motion is enabled, spinner CSS animations are not computed as active
- **Pass Condition**: All 12 state cases in the new test file pass with axe-core clean and every listed accessibility property verified
- **Evidence**: Jest green run for the test, axe no-violations output for each sub-case

### AC-8: Lockfile integrity is enforced in CI build job
- **Type**: `rule`
- **Given**: CI build job
- **When**: After `pnpm install --frozen-lockfile` completes, before the build step
- **Then**: A `git diff --exit-code pnpm-lock.yaml` (or equivalent) step compares the working tree lockfile with the committed one; if different, the job fails with "Unexpected pnpm-lock.yaml changes"
- **Pass Condition**: Build job in ci.yml contains the step, a negative test in scripts proves the check fails when the lockfile is mutated on disk, and CI run passes
- **Evidence**: CI yaml diff + scripts/__tests__ negative test

### AC-9: Only public NEXT_PUBLIC_ env is reachable from client modules
- **Type**: `rule`
- **Given**: Enumeration of all `process.env.*` references in production client code (client code = `src/app/**` + `src/components/**` + `src/hooks/**` + `src/lib/**` excluding files that import `getServerEnv` exclusively under `isBrowser() === false`)
- **When**: A jest test walks the AST or source and asserts the env key rule
- **Then**: Every referenced env key begins with `NEXT_PUBLIC_` OR the access is inside a server-only guarded code path; `getServerEnv()` throw-in-browser invariant remains green
- **Pass Condition**: New regression test at `src/__tests__/regression/client-env-leakage.test.ts` passes; any violations found are fixed as part of this task
- **Evidence**: Jest green run, any source fixes in diff

### AC-10: CODEOWNERS maintainer approval required for sensitive file changes
- **Type**: `rule`
- **Given**: The PR guardian workflow and `.github/CODEOWNERS`
- **When**: A PR modifies one or more files matching the sensitive glob list (contracts, security, wallet-boundary, transaction hooks, transaction components, protocol components, release/)
- **Then**: The guardian workflow (`.github/workflows/pr-guardian-report.yml` or a sibling `pr-security-review.yml`) checks the PR's reviews, finds an approval from a user/team matching the CODEOWNERS entry for that path, and fails the check + annotates with the exact missing reviewer requirement otherwise
- **Pass Condition**: Guardian script / workflow updated, integration test in `scripts/__tests__/pr-guardian.test.mjs` plants a mock PR payload with a sensitive file change, 0 maintainer approvals → fail; 1 maintainer approval → pass
- **Evidence**: CI yaml diff + test script passing both scenarios

### AC-11: No protocol fabrication — receipts and hashes are chain-originated
- **Type**: `rubric`
- **Dimension**: Auditability of the "never fabricate" invariant across transaction lifecycle modules
- **Scale**: 1-5
- **Anchors**:
  - 1 = Multiple hooks can locally manufacture a `txHash` or mark a transaction "finalized" without a canonical receipt
  - 3 = Existing `assertNoFabricatedData` + machine tests pass, but new coverage from this task is partial
  - 5 = Every success path from claim creation → verification → dispute → appeal → settlement → treasury → finalization calls `assertNoFabricatedData` or equivalent; new regression test plants a bad hash/dummy-address and confirms the UI never shows rewards/reputation/success; CI evidence of the plant test passing
- **Pass Threshold**: >= 4
- **Evidence**: New regression test `src/__tests__/regression/no-protocol-fabrication.test.ts` and unit-test additions; passing CI with coverage on the assertion paths

## Open Questions
- [ ] Is there an existing telemetry provider (Sentry, Datadog, PostHog) the redaction module should integrate with explicitly, or is a generic console+error-boundary hook sufficient for V2? (Default: generic console+error-boundary hook with exported `redactForTelemetry(payload)` adapter so a future provider cannot accidentally leak.)
- [ ] Should the CSP connect-src allowlist be defined as a single source of truth file shared between `next.config.ts` and `src/lib/env.ts`, or duplicated with a drift test? (Default: shared file `src/lib/security/csp-allowlist.ts` exported and imported from both places, with a test that the header renderer consumes the same list.)
- [ ] Is `audit-ci` desired over raw `pnpm audit` for the allowlist format? (Default: `pnpm audit --prod` parsed by a small script that consumes `.github/dependency-audit-allowlist.json` — avoids adding a devDependency.)
