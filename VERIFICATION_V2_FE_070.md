# Verification Checklist: V2-FE-070

## Internationalize Protocol and Error Copy

**Date:** September 24, 2026  
**Reviewer:** _________________  
**Status:** 🔄 Pending Review

---

## Pre-Merge Checklist

### 1. Installation and Setup

- [ ] Dependency installed: `pnpm add next-intl`
- [ ] No dependency conflicts
- [ ] Lock file updated correctly
- [ ] Build completes successfully: `pnpm build`
- [ ] Type check passes: `pnpm type-check`
- [ ] Linting passes: `pnpm lint`

### 2. Test Coverage

- [ ] All tests pass: `pnpm test`
- [ ] Test coverage meets requirements (>80%)
- [ ] Security constraint tests passing
- [ ] Component integration tests passing
- [ ] Formatter tests passing
- [ ] Protocol mapper tests passing
- [ ] Pluralization tests passing

### 3. Functionality Verification

#### Wallet Connection
- [ ] Connect button shows translated text
- [ ] Disconnect button shows translated text
- [ ] Address copy feedback in correct language
- [ ] Wallet address displayed verbatim (not translated)
- [ ] ARIA labels are translated

#### Claim Submission
- [ ] Form title translated
- [ ] Field labels translated
- [ ] Validation messages translated
- [ ] Error messages translated
- [ ] Button labels translated
- [ ] Content digest preserved (not translated)
- [ ] Contract addresses preserved
- [ ] Amount values preserved

#### Verification
- [ ] Verify button translated
- [ ] Reject button translated
- [ ] Status messages translated
- [ ] Claim ID preserved (not translated)
- [ ] Stake amount preserved

#### Transaction Status
- [ ] State labels translated
- [ ] Status cards show translated text
- [ ] Transaction hashes displayed in hex
- [ ] Block numbers formatted correctly
- [ ] Confirmation counts pluralized correctly

### 4. Security Verification

#### No Data Fabrication
- [ ] Formatters only operate on provided input
- [ ] No default addresses generated
- [ ] No default hashes generated
- [ ] No fake transaction data created
- [ ] Error extraction doesn't add fabricated fields

#### Technical Identifier Preservation
- [ ] Addresses never translated (only formatted)
- [ ] Transaction hashes never translated
- [ ] Chain IDs remain numeric
- [ ] Block numbers preserve exact values
- [ ] Gas amounts maintain precision
- [ ] Token amounts preserve value accuracy

#### Security Warnings
- [ ] "Wallet not connected" is unambiguous
- [ ] "Wrong network" shows both chain IDs
- [ ] "Transaction rejected" is explicit
- [ ] Error messages are clear and actionable
- [ ] No security warnings softened or vague

#### Type Safety
- [ ] Invalid translation keys cause compile errors
- [ ] All translation usage is type-checked
- [ ] No `any` types in i18n code
- [ ] Error parameter extraction is type-safe

#### No Information Leakage
- [ ] Error extraction uses allowlist approach
- [ ] No internal state exposed in errors
- [ ] No sensitive data in translation params
- [ ] Console logs don't leak sensitive info

### 5. Accessibility

- [ ] All buttons have ARIA labels
- [ ] Form fields have accessible labels
- [ ] Error messages have `role="alert"`
- [ ] Status changes use `aria-live`
- [ ] Screen reader announcements work
- [ ] Keyboard navigation unaffected
- [ ] Focus management preserved

### 6. Code Quality

#### Architecture
- [ ] Clean separation of concerns
- [ ] No circular dependencies
- [ ] Consistent file organization
- [ ] Clear module boundaries

#### TypeScript
- [ ] No `any` types
- [ ] No `@ts-ignore` comments
- [ ] All types properly exported
- [ ] Interfaces well-documented

#### Documentation
- [ ] Code comments for complex logic
- [ ] JSDoc for public APIs
- [ ] README updated if needed
- [ ] Examples provided for hooks

### 7. Performance

- [ ] No unnecessary re-renders
- [ ] Formatters are memoized
- [ ] Translation loading is efficient
- [ ] Bundle size impact acceptable (<20KB)
- [ ] No memory leaks in hooks

### 8. Browser Compatibility

- [ ] Works in Chrome/Edge
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Mobile responsive
- [ ] No console errors

### 9. Integration

- [ ] No breaking changes to existing APIs
- [ ] Backward compatible where possible
- [ ] Migration path documented
- [ ] No regressions in existing features
- [ ] Transaction machine unchanged
- [ ] Contract interactions unchanged

### 10. Documentation

- [ ] IMPLEMENTATION_V2_FE_070.md complete
- [ ] docs/I18N_SETUP.md accurate
- [ ] API documentation up to date
- [ ] Examples are working
- [ ] Migration guide clear

---

## Security Deep Dive

### Critical Verification Points

#### 1. Address Handling
```typescript
// ✅ CORRECT: Format but preserve
formatAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E', 'short')
// => "0x742d...0eB1E"

// ❌ INCORRECT: Would translate or modify
translate('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E')
// => NEVER happens in our implementation
```

Verified: [ ]

#### 2. Transaction Hash Handling
```typescript
// ✅ CORRECT: Display in hex
formatTxHash(hash, 'short')
// => "0x1234...cdef"

// ❌ INCORRECT: Would convert or translate
base64(hash) // Never done
```

Verified: [ ]

#### 3. Chain ID Handling
```typescript
// ✅ CORRECT: Numeric value preserved
const chainId = 10;
const networkName = getNetworkName(chainId); // "Optimism"

// ❌ INCORRECT: Would translate number itself
translate(chainId) // Never done
```

Verified: [ ]

#### 4. Error Message Security
```typescript
// ✅ CORRECT: Clear and explicit
"Wrong network. Connected to chain 1, expected chain 10"

// ❌ INCORRECT: Vague or misleading
"Network issue" // Too vague
"Please switch networks" // Doesn't specify which
```

Verified: [ ]

#### 5. Amount Precision
```typescript
// ✅ CORRECT: Preserve exact value
formatTokenAmount(1234567890123456789n, 18, 'en')
// => "1.234567890123456789"

// ❌ INCORRECT: Would round or truncate
parseFloat(amount.toString()) // Loses precision
```

Verified: [ ]

---

## Manual Testing Scenarios

### Scenario 1: Wallet Connection
1. Click "Connect Wallet"
2. Verify button text is translated
3. Connect wallet
4. Verify address is displayed in hex (not translated)
5. Click to copy address
6. Verify copy feedback message is translated
7. Click "Disconnect"
8. Verify button text is translated

**Result:** [ ] Pass [ ] Fail  
**Notes:** ___________________________________

### Scenario 2: Claim Submission
1. Open claim submission form
2. Verify form title is translated
3. Try to submit without filling fields
4. Verify validation errors are translated
5. Fill title with 2 characters
6. Verify "Title must be at least 5 characters" shows
7. Fill invalid URL in source
8. Verify "Enter a valid URL" shows
9. Submit without wallet connected
10. Verify "Connect wallet" prompt shows
11. Submit valid claim
12. Verify success message is translated
13. Verify content digest in transaction is hex

**Result:** [ ] Pass [ ] Fail  
**Notes:** ___________________________________

### Scenario 3: Wrong Network
1. Connect wallet to wrong network (e.g., Ethereum Mainnet)
2. Try to submit claim
3. Verify error shows: "Connected to chain 1, expected chain 10"
4. Verify both chain IDs are numeric and correct
5. Switch to correct network
6. Verify operation proceeds

**Result:** [ ] Pass [ ] Fail  
**Notes:** ___________________________________

### Scenario 4: Transaction Lifecycle
1. Submit a transaction
2. Verify "Preparing transaction" shows
3. Verify "Signature requested" shows
4. Sign transaction
5. Verify "Transaction submitted" shows
6. Verify transaction hash is in hex format
7. Wait for confirmation
8. Verify "Confirming" shows with count
9. Verify "X confirmations" is properly pluralized
10. Verify final state is "Finalized"

**Result:** [ ] Pass [ ] Fail  
**Notes:** ___________________________________

### Scenario 5: Verification Actions
1. Navigate to claim detail
2. Verify "Verify" button is translated
3. Verify "Reject" button is translated
4. Click Verify
5. Verify status message is translated
6. Verify claim ID in API call is unchanged

**Result:** [ ] Pass [ ] Fail  
**Notes:** ___________________________________

---

## Regression Testing

### Existing Features Must Still Work

- [ ] Transaction machine state transitions
- [ ] Contract read operations
- [ ] Contract write operations
- [ ] Event listening
- [ ] Receipt projection
- [ ] Settlement detection
- [ ] Finalization detection
- [ ] Wallet connection/disconnection
- [ ] Network switching
- [ ] Token approval flows
- [ ] Claim indexing verification

---

## Code Review Checklist

### Security Review
- [ ] No SQL injection vectors
- [ ] No XSS vulnerabilities
- [ ] No CSRF vulnerabilities
- [ ] No data fabrication possible
- [ ] Input validation comprehensive
- [ ] Error handling doesn't leak info
- [ ] Type safety enforced

### Architecture Review
- [ ] Follows existing patterns
- [ ] No tight coupling
- [ ] Clear module boundaries
- [ ] Testable design
- [ ] No circular dependencies
- [ ] Appropriate abstractions

### Code Style Review
- [ ] Consistent formatting
- [ ] Clear variable names
- [ ] No magic numbers
- [ ] No commented-out code
- [ ] No debugging console logs
- [ ] Follows project conventions

---

## Pre-Production Checklist

### Before Deployment

- [ ] All tests passing in CI
- [ ] Manual testing complete
- [ ] Security review approved
- [ ] Performance metrics acceptable
- [ ] Documentation reviewed
- [ ] Stakeholder approval obtained
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured

### Deployment Steps

1. [ ] Merge to main branch
2. [ ] Run production build
3. [ ] Deploy to staging
4. [ ] Smoke test on staging
5. [ ] Deploy to production
6. [ ] Verify in production
7. [ ] Monitor for errors

### Post-Deployment

- [ ] Monitor error rates
- [ ] Check user feedback
- [ ] Verify analytics tracking
- [ ] Document any issues
- [ ] Update runbook if needed

---

## Sign-off

### Developer
**Name:** _________________  
**Date:** _________________  
**Signature:** _________________

### Security Reviewer
**Name:** _________________  
**Date:** _________________  
**Signature:** _________________  
**Approval:** [ ] Approved [ ] Rejected  
**Comments:** ___________________________________

### Tech Lead
**Name:** _________________  
**Date:** _________________  
**Signature:** _________________  
**Approval:** [ ] Approved [ ] Rejected  
**Comments:** ___________________________________

---

## Issue Tracking

### Issues Found

| # | Description | Severity | Status | Resolution |
|---|-------------|----------|--------|------------|
| 1 |             |          |        |            |
| 2 |             |          |        |            |
| 3 |             |          |        |            |

### Notes

___________________________________
___________________________________
___________________________________

---

*Verification Document Version: 1.0.0*  
*Last Updated: September 24, 2026*  
*Implementation: V2-FE-070*
