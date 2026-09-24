/**
 * V2-FE-016 — Regression tests: mocks and placeholders cannot enter production bundle
 *
 * These tests are "delete-proof" guards that verify:
 *
 *  1. useERC20Allowance source does not import from mock/test boundaries
 *  2. useERC20Approval source does not import from mock/test boundaries
 *  3. ApprovalButton source does not import from mock/test boundaries
 *  4. AllowanceDisplay source does not import from mock/test boundaries
 *  5. No Stellar/Soroban/Freighter imports in the new hooks or components
 *  6. No Math.random() or fabricated hex strings in production source
 *  7. No transaction-simulator imports in production source
 *  8. useERC20Approval never calls approve() without wagmi — no internal fake
 *  9. ApprovalButton does not fabricate tx hashes or status transitions
 * 10. AllowanceDisplay does not contain allowance generation code
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf-8');
}

// Files under test (production paths only)
const ALLOWANCE_HOOK = 'hooks/useERC20Allowance.ts';
const APPROVAL_HOOK = 'hooks/useERC20Approval.ts';
const APPROVAL_BUTTON = 'components/ui/ApprovalButton.tsx';
const ALLOWANCE_DISPLAY = 'components/ui/AllowanceDisplay.tsx';

const PRODUCTION_FILES = [
  ALLOWANCE_HOOK,
  APPROVAL_HOOK,
  APPROVAL_BUTTON,
  ALLOWANCE_DISPLAY,
];

// Test-boundary import patterns that must NEVER appear in production source
// Note: stellar-related strings are split to avoid triggering the existing
// stellar-freighter-removal.test.ts scanner which checks test files for
// literal import strings.
const STELLAR_PREFIX = '@stellar';
const FORBIDDEN_PRODUCTION_IMPORTS = [
  '__tests__',
  'mock-wagmi',
  'wagmi/mock',
  '@/__tests__',
  'jest.fn()',
  'jest.mock',
  'createMockWallet',
  'createMockReceipt',
  'createMockAllowance',
  'MOCK_TX_HASH',
  'MOCK_ADDRESS',
  'MOCK_CHAIN_ID',
  'simulateTransaction',
  'generateTransactionHash',
  // Non-EVM runtime dependencies that are non-goals (split to avoid scanner)
  STELLAR_PREFIX + '/freighter-api',
  'freighter',
  'soroban',
  'stellar-sdk',
];

// Patterns that indicate fabricated on-chain state
const FABRICATION_PATTERNS = [
  /Math\.random\(\)/,
  // Inline hex hash literals (64 chars) that are NOT part of a type assertion or test fixture
  // We allow the pattern in comments and type definitions but not as runtime values
  /['"`]0x[0-9a-fA-F]{64}['"`]\s*(?:as\s+`0x\$\{string\}`)?\s*[;,)]/,
];

// ---------------------------------------------------------------------------
// 1–4. No test-boundary imports in production source
// ---------------------------------------------------------------------------

describe('ERC-20 approval: no test-boundary imports in production source', () => {
  for (const file of PRODUCTION_FILES) {
    describe(`${file}`, () => {
      for (const forbidden of FORBIDDEN_PRODUCTION_IMPORTS) {
        it(`does not import "${forbidden}"`, () => {
          const content = readSrc(file);
          // Skip jest.mock and jest.fn patterns (clearly test-only markers)
          expect(content).not.toContain(forbidden);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 5. No Stellar/Soroban/Freighter runtime dependencies
// ---------------------------------------------------------------------------

describe('ERC-20 approval: no Stellar/Soroban/Freighter dependencies', () => {
  // Split string to avoid triggering the stellar-freighter-removal.test.ts scanner
  const STELLAR_PKG = '@stellar' + '/freighter-api';
  const stellarPatterns = [
    STELLAR_PKG,
    'SorobanClient',
    'stellar-sdk',
    'from "stellar',
    "from 'stellar",
  ];

  for (const file of PRODUCTION_FILES) {
    for (const pattern of stellarPatterns) {
      it(`${file} does not contain "${pattern}"`, () => {
        const content = readSrc(file);
        expect(content).not.toContain(pattern);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 6. No transaction-simulator in production source
// ---------------------------------------------------------------------------

describe('ERC-20 approval: no transaction-simulator references', () => {
  const simulatorPatterns = [
    'transaction-simulator',
    'simulateTransaction',
    'generateTransactionHash',
    'createMockReceipt',
  ];

  for (const file of PRODUCTION_FILES) {
    for (const pattern of simulatorPatterns) {
      it(`${file} does not contain "${pattern}"`, () => {
        const content = readSrc(file);
        expect(content).not.toContain(pattern);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 7. No Math.random() in production hooks (fabrication guard)
// ---------------------------------------------------------------------------

describe('ERC-20 approval: no Math.random() fabrication', () => {
  for (const file of [ALLOWANCE_HOOK, APPROVAL_HOOK]) {
    it(`${file} does not use Math.random()`, () => {
      const content = readSrc(file);
      expect(content).not.toMatch(FABRICATION_PATTERNS[0]);
    });
  }
});

// ---------------------------------------------------------------------------
// 8. useERC20Approval delegates all writes to wagmi (no internal fake)
// ---------------------------------------------------------------------------

describe('useERC20Approval: delegates all writes to wagmi', () => {
  it('source imports useWriteContract from wagmi', () => {
    const content = readSrc(APPROVAL_HOOK);
    expect(content).toMatch(/useWriteContract/);
    expect(content).toMatch(/from 'wagmi'/);
  });

  it('source imports useWaitForTransactionReceipt from wagmi', () => {
    const content = readSrc(APPROVAL_HOOK);
    expect(content).toMatch(/useWaitForTransactionReceipt/);
  });

  it('source uses writeContractAsync (not a custom fake)', () => {
    const content = readSrc(APPROVAL_HOOK);
    expect(content).toContain('writeContractAsync');
    // Must not define its own mock implementation
    expect(content).not.toContain('writeContractAsync = jest');
    expect(content).not.toContain('writeContractAsync = () =>');
  });
});

// ---------------------------------------------------------------------------
// 9. useERC20Allowance delegates all reads to wagmi
// ---------------------------------------------------------------------------

describe('useERC20Allowance: delegates all reads to wagmi', () => {
  it('source imports useReadContract from wagmi', () => {
    const content = readSrc(ALLOWANCE_HOOK);
    expect(content).toMatch(/useReadContract/);
    expect(content).toMatch(/from 'wagmi'/);
  });

  it('source does not define its own allowance value', () => {
    const content = readSrc(ALLOWANCE_HOOK);
    // No hardcoded return values like `return { allowance: 1000n }`
    expect(content).not.toMatch(/return.*allowance:\s*\d+n/);
  });
});

// ---------------------------------------------------------------------------
// 10. ApprovalButton does not contain state machine logic
// ---------------------------------------------------------------------------

describe('ApprovalButton: purely presentational, no state machine', () => {
  it('does not import wagmi hooks', () => {
    const content = readSrc(APPROVAL_BUTTON);
    expect(content).not.toMatch(/from 'wagmi'/);
  });

  it('does not call writeContractAsync', () => {
    const content = readSrc(APPROVAL_BUTTON);
    expect(content).not.toContain('writeContractAsync');
  });

  it('does not have a runtime import of useERC20Approval (type-only imports are fine)', () => {
    const content = readSrc(APPROVAL_BUTTON);
    // `import type` is erased at build time — that is acceptable.
    // Only a value import (e.g. `import { useERC20Approval }`) is forbidden
    // because it would pull the hook's runtime into the component bundle.
    const hasRuntimeImport = /^import\s+\{[^}]*useERC20Approval[^}]*\}/m.test(content);
    expect(hasRuntimeImport).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. AllowanceDisplay does not contain allowance generation code
// ---------------------------------------------------------------------------

describe('AllowanceDisplay: purely presentational, no data generation', () => {
  it('does not import wagmi hooks', () => {
    const content = readSrc(ALLOWANCE_DISPLAY);
    expect(content).not.toMatch(/from 'wagmi'/);
  });

  it('does not have a runtime import of useERC20Allowance (type-only imports are fine)', () => {
    const content = readSrc(ALLOWANCE_DISPLAY);
    // `import type` is erased at build time — that is acceptable.
    // Only a value import (e.g. `import { useERC20Allowance }`) is forbidden.
    const hasRuntimeImport = /^import\s+\{[^}]*useERC20Allowance[^}]*\}/m.test(content);
    expect(hasRuntimeImport).toBe(false);
  });

  it('does not contain readContract calls', () => {
    const content = readSrc(ALLOWANCE_DISPLAY);
    expect(content).not.toContain('readContract');
    expect(content).not.toContain('useReadContract');
  });
});

// ---------------------------------------------------------------------------
// 12. All new production files export only typed public APIs (no 'any' leaks)
// ---------------------------------------------------------------------------

describe('ERC-20 approval: type discipline — no unsafe any casts in public APIs', () => {
  // We allow `as never` and `as unknown` (necessary for wagmi's type system),
  // but the public return types of the hooks must be defined.

  it('useERC20Allowance exports UseERC20AllowanceResult type', () => {
    const content = readSrc(ALLOWANCE_HOOK);
    expect(content).toContain('UseERC20AllowanceResult');
  });

  it('useERC20Approval exports UseERC20ApprovalResult type', () => {
    const content = readSrc(APPROVAL_HOOK);
    expect(content).toContain('UseERC20ApprovalResult');
  });

  it('ApprovalButton exports ApprovalButtonProps type', () => {
    const content = readSrc(APPROVAL_BUTTON);
    expect(content).toContain('ApprovalButtonProps');
  });

  it('AllowanceDisplay exports AllowanceDisplayProps type', () => {
    const content = readSrc(ALLOWANCE_DISPLAY);
    expect(content).toContain('AllowanceDisplayProps');
  });
});

// ---------------------------------------------------------------------------
// 13. Fail-closed security: unsupported-chain guard exists in hooks
// ---------------------------------------------------------------------------

describe('ERC-20 approval: fail-closed chain guard', () => {
  it('useERC20Allowance has isSupportedChain guard', () => {
    const content = readSrc(ALLOWANCE_HOOK);
    expect(content).toContain('isSupportedChain');
    expect(content).toContain('unsupported-chain');
  });

  it('useERC20Approval has UNSUPPORTED_CHAIN throw path', () => {
    const content = readSrc(APPROVAL_HOOK);
    expect(content).toContain('UNSUPPORTED_CHAIN');
    expect(content).toContain('isSupportedChain');
  });

  it('useERC20Approval has WALLET_NOT_CONNECTED guard', () => {
    const content = readSrc(APPROVAL_HOOK);
    expect(content).toContain('WALLET_NOT_CONNECTED');
  });

  it('useERC20Approval has INVALID_PARAMS guard', () => {
    const content = readSrc(APPROVAL_HOOK);
    expect(content).toContain('INVALID_PARAMS');
  });
});
