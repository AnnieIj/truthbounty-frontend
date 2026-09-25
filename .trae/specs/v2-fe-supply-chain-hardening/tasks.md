# TruthBounty V2 Frontend — Supply Chain & Dependency Hardening Implementation Plan

## Task 1: Shared CSP allowlist source & Security Headers + Middleware
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create `src/lib/security/csp-allowlist.ts` exporting connect-src origins (RPC/API/WSS/Explorer/IPFS gateway defaults), trusted script sources, and trusted style/image origins; type `CspAllowlist`.
  - Create `src/middleware.ts` (or extend existing if present) that generates a per-request 128-bit random nonce via `crypto` and injects:
    - `Content-Security-Policy` header: default-src 'self'; script-src 'self' 'nonce-{nonce}' + trusted scripts; style-src 'self' 'nonce-{nonce}' (to cover styled-components/tailwind where needed) plus strict defaults; img-src 'self' data: https: ipfs:; connect-src 'self' + allowlist origins; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; font-src 'self' data:; media-src 'self'.
    - `X-Content-Type-Options: nosniff`.
    - `Referrer-Policy: strict-origin-when-cross-origin`.
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  - In development add Storybook/Vite-specific relaxations so HMR works; production always uses the strict policy.
  - Pass the nonce through request headers into the root layout so `ThemeInitScript` can consume it.
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `rule` TR-1.1: Unit test `src/lib/security/__tests__/csp-allowlist.test.ts` serializes an expected allowlist and the default build policy string contains `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, and no `unsafe-inline` in `script-src`.
  - `rule` TR-1.2: Unit test `src/lib/security/__tests__/middleware.test.ts` (via node-mocks-http or Next.js test utilities) invokes the middleware chain and asserts the response headers include the nonce value mirrored in the CSP string.
  - `rubric` TR-1.3: Nonce generation quality; scale 1-5; anchors 1=nonces are constant or short, 3=nonces are random 64-bit, 5=nonces are 128-bit URL-safe base64 and regenerated per request with no collisions in 10k consecutive calls; threshold >= 4; evidence = unit test with collision + entropy checks.
- **Notes**: If `middleware.ts` already exists, extend it; avoid splitting nonce logic across multiple files.

## Task 2: Anchor ThemeInitScript with CSP nonce in Root Layout
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Update `src/lib/theme-init.tsx` `ThemeInitScript` to use the nonce prop (already typed) and ensure the rendered script element has the `nonce` attribute set.
  - Update `src/app/layout.tsx` `RootLayout` to read the nonce from headers (set by Task 1 middleware) and pass it to `<ThemeInitScript nonce={nonce} />`.
  - Confirm no other `dangerouslySetInnerHTML` call sites exist outside the allowlisted module (already covered by Task 5 comprehensive-drift test; the fix here happens first so Task 5 passes).
- **Acceptance Criteria Addressed**: AC-1, AC-4
- **Test Requirements**:
  - `rule` TR-2.1: Component test `src/lib/__tests__/theme-init.test.tsx` renders `<ThemeInitScript nonce="abc123" />` and asserts the resulting `<script>` has `nonce="abc123"` and contains the expected theme script with no `eval` or `new Function` usage.
  - `rule` TR-2.2: Integration test renders RootLayout with a mocked header carrying nonce and asserts the serialized HTML includes `<script nonce="…">` for theme init.
- **Notes**: Any other inline scripts discovered during this work must be converted to nonced scripts or removed.

## Task 3: Dependency Audit Gate + Allowlist File
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create `.github/dependency-audit-allowlist.json` with schema `{ advisories: Array<{ id: string; reason: string; expiresAt: string | null }> }` (initially empty, or populate for any current advisories so CI is green).
  - Create `scripts/dependency-audit.mjs` that shells out to `pnpm audit --prod --json`, parses advisories, filters allowlisted IDs, and exits non-zero when remaining severity ≥ high.
  - Add a new `dependency-security` job to `.github/workflows/ci.yml` that runs the script after a frozen install.
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `rule` TR-3.1: Unit test `scripts/__tests__/dependency-audit.test.mjs` mocks `pnpm audit` JSON output with a high-severity advisory (ID=999) and asserts exit code 1; when that ID is allowlisted with expiresAt=null the exit is 0.
  - `rule` TR-3.2: CI yaml change is valid (use `yamllint` or `node -e require('js-yaml')` parse check in a test).
- **Notes**: Keep the audit script zero-dependency (no new packages).

## Task 4: Secret Scan Script + CI Job
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create `scripts/secret-scan.mjs` scanning `src/`, `release/`, and `.next/` (after build) for:
    - EVM private-key literal: `/\b0x[a-fA-F0-9]{64}\b/`
    - Generic sk/pk tokens: `/\b(sk|pk)_(live|test)_[A-Za-z0-9_\-]{16,}/`
    - Suspicious NEXT_PUBLIC_ values: any `NEXT_PUBLIC_WORLDCOIN_*` or `NEXT_PUBLIC_WALLETCONNECT_*` variable that also contains the substring `private`/`secret`/`-----BEGIN`/`Bearer `
  - Allowlist mechanism: a preceding `// secret-scan-allow: <reason>` comment or `.gitignore`d paths. Test fixture private keys in `__tests__` are only allowlisted via explicit comments.
  - Add a `secret-scan` job in CI that runs before build (fast) and again after build against `.next/`.
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `rule` TR-4.1: Unit test `scripts/__tests__/secret-scan.test.mjs` creates a temp fixture tree containing each pattern (once allowlisted, once not) and asserts correct pass/fail + exit codes.
  - `rule` TR-4.2: CI yaml contains the job referencing the script.
- **Notes**: The scan must handle multiline strings safely (no catastrophic backtracking). Limit regex to bounded length.

## Task 5: Comprehensive Artifact-Drift Regression
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2 (so nonced theme-init is the only allowlisted dangerouslySetInnerHTML)
- **Description**:
  - Create `src/__tests__/regression/comprehensive-artifact-drift.test.ts`.
  - Walk `src/` excluding `__tests__`, `stories`, `data/mock-data.ts` (same walker pattern as production-mock-isolation).
  - For every production source file, assert absence of:
    - Stellar/Freighter/Soroban/steexp tokens (reuse `stellar-freighter-removal` FORBIDDEN_TOKENS, add any new surface names).
    - MSW imports, mock-wagmi imports, setupMockServer usage.
    - Placeholder addresses: `0xYourContract`, `0x000...000`, `0x111...111`, `0xaaaa...aaaa`.
    - Fabrication APIs: `Math.random()`, `crypto.randomUUID()` followed by assignment to a variable named `*Hash`/`*Receipt` (heuristic; throw on obvious matches), `setTimeout` being used to transition any state whose name matches `/final|success|complete|confirmed|indexed/`.
    - `dangerouslySetInnerHTML` anywhere except the allowlisted `src/lib/theme-init.tsx` (exact path match).
  - The test should also verify that `TRACKED_FILES` in load-artifacts.ts and `scripts/verify-artifacts.mjs` agree — add a drift check between the two arrays.
- **Acceptance Criteria Addressed**: AC-4, AC-11
- **Test Requirements**:
  - `rule` TR-5.1: New test passes against the current codebase (fix any violations discovered as part of this task before marking done).
  - `rubric` TR-5.2: Breadth of file walk coverage; scale 1-5; anchors 1=walks only 5 files, 3=walks 40+ but skips nested components/hooks, 5=walks every production `ts/tsx/js/jsx` file in `src/` (>50); threshold >= 4; evidence = test output line count of walked files reported by jest.
- **Notes**: Any violations discovered during implementation are bugs in the current codebase and must be fixed inline (no deferral) to make TR-5.1 pass.

## Task 6: Safe External Link Hardening Regression
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - Create `src/__tests__/regression/external-links-hardened.test.ts`.
  - For every production `.tsx` file (exclude `__tests__`, `stories`):
    - Use a regex/AST conservative search for JSX `<a target="_blank"` props or object props like `target: "_blank"`.
    - For each match:
      - If the rendered component is `<SafeExternalLink>` (the tag name matches), pass.
      - Else assert a sibling `rel="..."` attribute exists whose value passes `isHardenedRel`.
  - Fix any violations found in production components (e.g., add `rel={SAFE_EXTERNAL_REL}` or migrate to `<SafeExternalLink>`).
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `rule` TR-6.1: New regression test passes on current codebase (with inline fixes).
  - `rule` TR-6.2: Unit test `src/components/security/__tests__/SafeExternalLink.test.tsx` (or existing) renders `<SafeExternalLink href="https://example.com" target="_blank">…</>` and asserts rel contains `noopener noreferrer nofollow`.
- **Notes**: Keep detection simple and conservative; false negatives are OK if the pattern matches all obvious JSX usage. AST parsing with a lightweight walker is preferred over regex if available without new deps.

## Task 7: Telemetry / Error Redaction Module & Wiring
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create `src/lib/security/redaction.ts` exporting:
    - `redactForTelemetry(value: unknown): unknown` — deep clones, redacts any key matching `/token|secret|authorization|password|privatekey|apikey|cookie/i`, any string matching `/\b0x[a-fA-F0-9]{64}\b/` that looks like a signature (length > 64 chars or key named `signature`/`calldata`), raw calldata `0x[a-fA-F0-9]{20,}` longer than 10 bytes.
    - `redactError(error: unknown): { name: string; message: string; stack: string | null; cause: unknown }` — strips sensitive strings from error messages and stack traces.
    - `REDACTED = '[REDACTED]'` constant.
  - Wire the redactor into:
    - `src/app/global-error.tsx` before logging to console/error reporting.
    - `src/components/common/ErrorBoundary.tsx` before any `console.error` or DOM rendering of the error.
    - Any existing `console.error` sites in lifecycle hooks (use*Transaction hooks, Siwe client).
  - Export an adapter `redactForErrorReporter(payload)` callable by future Sentry/PostHog providers.
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `rule` TR-7.1: Unit test `src/lib/security/__tests__/redaction.test.ts` covers each sensitive key/pattern; assert the redacted value is `REDACTED` and non-sensitive fields (`chainId`, `txHash`, `blockNumber`, `reason`) pass through.
  - `rule` TR-7.2: Integration test `src/__tests__/accessibility/error-boundaries.test.tsx` (existing file, add a case) throws an Error whose message contains `privateKey=0xAAAA…AAAA` and asserts the rendered fallback DOM does NOT contain the hex string; also assert the logged console.error value (spied) is the redacted form.
- **Notes**: Deep clone must avoid prototype pollution. Use structured clone where available + manual recursion for older runtimes, or a tiny safe clone helper.

## Task 8: Accessibility & Degraded State UX Test Battery
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7 (redaction wiring must be present for error states)
- **Description**:
  - Create `src/__tests__/accessibility/degraded-state-ux.test.tsx`.
  - Render each of these states through their canonical components and run axe-core + focus/animation checks:
    1. Loading/skeleton (e.g., `ClaimDetailsSkeleton`, `ActiveClaimsTableSkeleton`)
    2. Empty (empty claims list)
    3. Stale (`ApiStaleBanner` + stale claims list)
    4. Rejected (user-rejected tx in TransactionStatus)
    5. Failed / reverted (`ReorgBanner` with error reason / status-card in failed state)
    6. Pending/submitted (transaction-item in submitted)
    7. Confirming (confirming state with 2 confirmations)
    8. Confirmed-not-safe (safe=False, confirmation < finality policy)
    9. Finalized (finalized/indexed success)
    10. Reorged (ReorgBanner active, success withdrawn)
    11. ConfigurationError / chain unsupported (ChainIntegrityGuard with unsupported chainId 1)
    12. Degraded / RPC fallback (FallbackBoundary status='degraded')
  - Assertions:
    - axe-core no WCAG AA violations
    - A live region (`role="status"` or `role="alert"`) announces the state change
    - Retry/reset/ack buttons are tabbable (tabindex >= 0 or semantic button)
    - Banner text has AA contrast against background in both light/dark themes (use get-computed-style on the rendered node)
    - When `prefers-reduced-motion: reduce` is mocked, any CSS animation on the status spinner/spinner icon has computed `animation-name: none` or equivalent
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `rule` TR-8.1: All 12 cases pass axe with 0 violations.
  - `rule` TR-8.2: Every state case has ≥ 1 assertion for live-region text content.
  - `rubric` TR-8.3: Coverage of recovery paths; scale 1-5; anchors 1=only rendering checked, 3=retries clicked and form preservation asserted for half the cases, 5=for every failure case, after clicking the offered retry/reset, the form's pre-filled user-authored text (where applicable, e.g., ClaimSubmissionForm) is preserved verbatim; threshold >= 4; evidence = sub-test output for form preservation assertions.
- **Notes**: Use existing `axe.ts` utils from the codebase. Prefer existing component props/snapshot overrides to trigger states rather than wiring real wallet state.

## Task 9: Lockfile Integrity CI Step
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - In `.github/workflows/ci.yml` build job, between `pnpm install --frozen-lockfile` and `npm run build`, insert:
    - A step `Check lockfile integrity` that runs `git diff --exit-code pnpm-lock.yaml` (or a Node script equivalent that works on detached HEAD). If the file differs, fail with "Unexpected pnpm-lock.yaml changes; CI install mutated the lockfile. Re-run with updated dependencies."
  - Create a small helper `scripts/check-lockfile.mjs` that can be run locally and in CI (so the same logic runs in both environments).
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-9.1: `scripts/__tests__/check-lockfile.test.mjs` writes a random byte to `pnpm-lock.yaml` on disk in a temp copy and expects exit code 1; reverting the change expects exit code 0.
  - `rule` TR-9.2: CI yaml diff shows the new step in the build job.
- **Notes**: Handle edge case where CI checkout is not a git repo (some runners); if `.git/` does not exist, skip the git diff and only compare a pre-install/post-install SHA recorded by the helper.

## Task 10: Client Environment Leakage Regression
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create `src/__tests__/regression/client-env-leakage.test.ts`.
  - Walk every production `.ts`/`.tsx`/`.js`/`.jsx` file in `src/` (exclude `__tests__`, `stories`, `data/mock-data.ts`).
  - For each file, search for `process.env.KEY_NAME` patterns.
  - Rule:
    - If `KEY_NAME` starts with `NEXT_PUBLIC_` → OK.
    - Else → the containing function/scope must either (a) call `isBrowser() === false` in a guard, OR (b) the function is defined in a module that is only imported by server code (use a simple allowlist of server-only files: `src/app/api/**/*`, `src/lib/contracts/load-artifacts.ts` (Node fs runtime), `scripts/**`, or the access is inside `getServerEnv`).
    - Cross-check with existing `getServerEnv()` throw-in-browser invariant — re-run that assertion against any new `SERVER_ONLY_KEYS` discovered.
  - Fix any violations found (e.g., move a server-only env access behind a server-only boundary or convert to NEXT_PUBLIC_ only if safe).
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-10.1: New test passes after inline fixes for any discovered violations.
  - `rule` TR-10.2: Existing test for `getServerEnv()` throw-in-browser invariant is still green and referenced.
- **Notes**: Keep detection conservative; a tiny regex like `/process\.env\.([A-Z_][A-Z0-9_]*)/g` with simple string scanning is acceptable.

## Task 11: CODEOWNERS Maintainer Approval Guardian
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Inspect existing `.github/CODEOWNERS` and ensure there is an entry for the sensitive globs:
    - `src/lib/contracts/**`
    - `src/lib/security/**`
    - `src/lib/wallet-boundary/**`
    - `src/hooks/*Transaction*.ts`
    - `src/hooks/useWallet*.ts`
    - `src/components/transactions/**`
    - `src/components/protocol/**`
    - `release/**`
    → Point these at the team `@truthbounty/v2-maintainers` (create the team reference; if the team handle is unknown, leave a TODO that a maintainer must resolve BEFORE merge, and gate the guardian on an env var `CODEOWNERS_REVIEWER_TEAM` so the test suite can inject a value).
  - Update `.github/workflows/pr-guardian-report.yml` or create `.github/workflows/pr-security-review.yml` to:
    - On PR events, list changed files.
    - If any path matches the sensitive glob list, fetch PR reviews from the GitHub API (`pulls/{number}/reviews`).
    - Fail the check and annotate the PR unless there is at least one `APPROVED` review authored by a user who is a CODEOWNERS designee for the sensitive paths.
  - Implement the guardian logic in `.github/scripts/pr-guardian.mjs` (Node) so it is locally testable.
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**:
  - `rule` TR-11.1: Unit test `scripts/__tests__/pr-guardian.test.mjs` constructs two mock PR payloads: (a) sensitive file + 0 maintainer approvals → returns error/exit 1; (b) sensitive file + 1 maintainer approval → exit 0; (c) non-sensitive file + 0 approvals → exit 0.
  - `rule` TR-11.2: `.github/CODEOWNERS` contains entries for all 8 sensitive globs listed above (exact or broader) with a team or user target.
  - `rule` TR-11.3: CI workflow yaml diff adds the PR security review job that invokes the guardian.
- **Notes**: Avoid external actions; use `actions/github-script` or a Node script calling `$GITHUB_TOKEN`.

## Task 12: Never-Fabricate Protocol Invariant Coverage + Security Headers E2E
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1, 2, 5, 7
- **Description**:
  - Add regression `src/__tests__/regression/no-protocol-fabrication.test.ts`:
    - For each canonical write hook listed in TRANSACTION_STATE_MODEL.md (claim creation, verification, dispute, appeal, settlement, treasury withdrawal):
      - Import the hook's validator/simulator code path and inject a bad hash (`0x0000…0001`) or dummy address (`0x1111…1111`) into its input/receipt.
      - Assert `assertNoFabricatedData` or the machine's validation throws and the state never transitions to `finalized`/`indexed`.
  - Add Playwright E2E test `e2e/security-headers.spec.ts`:
    - Start the built Next server on a random port.
    - Fetch `/` and assert headers: CSP present, X-Content-Type-Options=nosniff, Referrer-Policy=strict-origin-when-cross-origin, Permissions-Policy contains `camera=()`.
    - Assert CSP `script-src` does NOT contain `unsafe-inline`.
    - Navigate the homepage and check `page.on("console")`/`page.on("pageerror")` for any CSP violation messages — 0 violations expected after load + click of at least 2 buttons (connect, theme toggle).
  - Update `playwright.config.ts` to include the new test file in the default project.
- **Acceptance Criteria Addressed**: AC-11, AC-1
- **Test Requirements**:
  - `rule` TR-12.1: Every write hook path in the regression test throws on bad hash/dummy address before any success rendering.
  - `rule` TR-12.2: E2E test passes against a production build.
  - `rubric` TR-12.3: Strength of the fabrication-coverage plant test; scale 1-5; anchors 1=only 1 hook tested, 3=3 hooks tested, 5=all 6 hooks (claim, verification, dispute, appeal, settlement, withdrawal) are individually planted with a violation and each independently fails before reaching finalized; threshold >= 4; evidence = each `it(...)` in the test file.
- **Notes**: Keep injected values obviously suspicious so reviewers see they are test fixtures; add `// secret-scan-allow: test fixture` comments.

## Task 13: CI Matrix Integration — Jobs Must All Pass With No Concealed Skips
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1, 3, 4, 9, 11, 12
- **Description**:
  - Final integration pass on `.github/workflows/ci.yml`:
    - Verify every new job (dependency-security, secret-scan, pr-security-review, e2e including the new security-headers spec) has `if:` clauses that never force-success — no `continue-on-error: true` on gates, no `if: always()` wrapping.
    - Ensure all jobs are in the default required-check set or are children of a required job (for branch-protection evidence).
  - Update `jest.config.js` if needed so `--runInBand` is used for regression tests that walk the file tree (avoid race conditions in the walker).
  - Add a CI job summary step that echoes each gate's result for human review in the Actions UI.
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-8, AC-10, NFR-5
- **Test Requirements**:
  - `rule` TR-13.1: Static grep of the CI yaml for `continue-on-error: true` returns 0 matches in security-sensitive jobs, and grep for `if: always()` returns 0 matches wrapping test/build commands.
  - `rule` TR-13.2: A dry `pnpm run lint && pnpm run type-check && pnpm run test && pnpm run test:a11y` run against the repo passes locally (or all failures are known unrelated issues tracked separately).
- **Notes**: Do not add `skip` / `.skip` to jest cases; if something is flaky, mark it as a `blocked` task with Unblock Condition instead.

## Task 14: Update Documentation Where Behavior Changed
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Tasks 1, 7, 11
- **Description**:
  - Update `docs/ARCHITECTURE.md` to add a "Security Posture" section referencing: CSP nonce strategy, redaction module, sensitive-file CODEOWNERS, dependency/secret scan CI.
  - Update `docs/RELEASE_READINESS_V2_FE_090.md` (or the most current release-readiness doc) to include checkboxes for all new gates: headers, audit, secrets, lockfile, guardian.
  - Add inline JSDoc/Typedoc comments to: `redaction.ts`, `csp-allowlist.ts`, `middleware.ts`, `scripts/secret-scan.mjs`, `scripts/dependency-audit.mjs`, `pr-guardian.mjs` so future maintainers can understand each component without reading CI yaml.
- **Acceptance Criteria Addressed**: NFR-1 through NFR-6 (documentation & discoverability), AC-6 (discoverability of redaction)
- **Test Requirements**:
  - `rule` TR-14.1: Static grep of each new module finds a JSDoc top-level comment.
  - `rule` TR-14.2: ARCHITECTURE.md updated with a new Security Posture section containing at least 5 links to the new modules/files.
- **Notes**: Do NOT rewrite unrelated docs. Keep the Security Posture section to one screen of text.
