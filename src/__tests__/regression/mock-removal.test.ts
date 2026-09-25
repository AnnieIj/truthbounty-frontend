/**
 * V2-FE-009 — Regression tests for removed mock, legacy, and unsafe behaviours.
 *
 * These tests are the "delete-proof": they verify that removed code no longer
 * exists or no longer does unsafe things, so that future changes cannot silently
 * re-introduce fabricated state.
 *
 * Coverage:
 *  1. claimRewards() in wallet.ts throws NotImplemented (no fake hash)
 *  2. getTokenBalance() in wallet.ts throws NotImplemented
 *  3. useWallet() no longer returns a numeric `balance` field
 *  4. transaction-simulator.ts no longer exports any real simulator functions
 *  5. pending-transactions storage key is v2 (old v1 key is abandoned)
 *  6. PendingTransactionEntry includes the v2 fields (txHash, chainId, machineState)
 *  7. @stellar/freighter-api is NOT imported by useAccount
 */

import { renderHook } from '@testing-library/react';
import * as fs from 'fs';
import * as path from 'path';

// Mock wagmi at top level for test environment
jest.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useChainId: () => 10,
  useDisconnect: () => ({ disconnect: jest.fn() }),
  useConnect: () => ({ connect: jest.fn(), isPending: false }),
  useConnectors: () => [],
}));

// ---------------------------------------------------------------------------
// 1 & 2. wallet.ts stubs throw NotImplemented
// ---------------------------------------------------------------------------

describe('wallet.ts — mock hash generation removed', () => {
  it('claimRewards throws a descriptive NotImplemented error', async () => {
    const { claimRewards } = await import('@/app/lib/wallet');
    await expect(claimRewards(['claim-1'])).rejects.toThrow(
      /Not implemented.*V2-FE-003/,
    );
  });

  it('claimRewards does NOT return a fabricated txHash', async () => {
    const { claimRewards } = await import('@/app/lib/wallet');
    let result: { txHash: `0x${string}` } | undefined;
    try {
      result = await claimRewards(['claim-1']);
    } catch {
      // expected
    }
    expect(result).toBeUndefined();
  });

  it('getTokenBalance throws a descriptive NotImplemented error', async () => {
    const { getTokenBalance } = await import('@/app/lib/wallet');
    await expect(getTokenBalance()).rejects.toThrow(
      /Not implemented.*V2-FE-003/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. useWallet no longer exposes a numeric balance
// ---------------------------------------------------------------------------

describe('useWallet — numeric balance removed', () => {
  it('useWallet return value does not include a balance field', async () => {
    const { useWallet } = await import('@/hooks/useWallet');
    const { result } = renderHook(() => useWallet());

    // Should have these keys
    expect(result.current).toHaveProperty('address');
    expect(result.current).toHaveProperty('chainId');
    expect(result.current).toHaveProperty('isConnected');

    // Should NOT have a numeric balance or toy methods
    expect(result.current).not.toHaveProperty('balance');
    expect(result.current).not.toHaveProperty('deposit');
    expect(result.current).not.toHaveProperty('withdraw');
  });
});

// ---------------------------------------------------------------------------
// 4. transaction-simulator.ts no longer exports real simulator functions
// ---------------------------------------------------------------------------

describe('transaction-simulator.ts — real simulator removed', () => {
  it('does not export simulateTransaction', async () => {
    const mod = await import('@/lib/transaction-simulator');
    expect(typeof (mod as Record<string, unknown>)['simulateTransaction']).not.toBe('function');
  });

  it('does not export generateTransactionHash', async () => {
    const mod = await import('@/lib/transaction-simulator');
    expect(typeof (mod as Record<string, unknown>)['generateTransactionHash']).not.toBe('function');
  });

  it('does not export createMockReceipt', async () => {
    const mod = await import('@/lib/transaction-simulator');
    expect(typeof (mod as Record<string, unknown>)['createMockReceipt']).not.toBe('function');
  });

  it('does not export simulateTransactionWorkflow', async () => {
    const mod = await import('@/lib/transaction-simulator');
    expect(typeof (mod as Record<string, unknown>)['simulateTransactionWorkflow']).not.toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 5. pending-transactions uses v2 storage key
// ---------------------------------------------------------------------------

describe('pending-transactions — v2 storage key', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes to the v2 key, not v1', async () => {
    const { trackPendingTransaction } = await import('@/lib/pending-transactions');
    trackPendingTransaction({
      id: 'key-test',
      kind: 'rewards',
      title: 'Test',
      description: 'Key test',
      txHash: null,
      chainId: null,
      machineState: 'idle',
    });

    // v2 key present
    expect(localStorage.getItem('truthbounty-pending-transactions-v2')).not.toBeNull();
    // v1 key absent
    expect(localStorage.getItem('truthbounty-pending-transactions')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. PendingTransactionEntry includes v2 fields
// ---------------------------------------------------------------------------

describe('PendingTransactionEntry — v2 fields present', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists and reads back txHash, chainId, and machineState', async () => {
    const { trackPendingTransaction, getPendingTransactions } =
      await import('@/lib/pending-transactions');

    trackPendingTransaction({
      id: 'v2-fields-test',
      kind: 'verification',
      title: 'Verification',
      description: 'V2 fields test',
      txHash:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 10,
      machineState: 'submitted',
    });

    const entries = getPendingTransactions();
    expect(entries).toHaveLength(1);
    expect(entries[0].txHash).toBe(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(entries[0].chainId).toBe(10);
    expect(entries[0].machineState).toBe('submitted');
  });

  it('filters out stale v1 entries that lack machineState', async () => {
    // Write a stale v1 entry to the v2 key
    const stale = JSON.stringify([
      {
        id: 'stale-no-machine-state',
        kind: 'rewards',
        title: 'Old',
        description: 'Old entry',
        createdAt: Date.now(),
        // missing txHash, chainId, machineState
      },
    ]);
    localStorage.setItem('truthbounty-pending-transactions-v2', stale);

    const { getPendingTransactions } = await import('@/lib/pending-transactions');
    const entries = getPendingTransactions();
    // Stale entry filtered because it lacks `machineState`
    expect(entries.find((e) => e.id === 'stale-no-machine-state')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. useAccount does NOT import from @stellar/freighter-api
// ---------------------------------------------------------------------------

describe('useAccount — Stellar/Freighter dependency removed', () => {
  it('useAccount source code does not contain @stellar/freighter-api import', () => {
    const filePath = path.resolve(__dirname, '../../hooks/useAccount.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toContain("from '@stellar/freighter-api'");
    expect(content).not.toContain('from "@stellar/freighter-api"');
  });
});

// ---------------------------------------------------------------------------
// 8. Production bundle must not import mock datasets or fabricate runtime state
// ---------------------------------------------------------------------------

describe('production bundle — mock isolation', () => {
  it('does not import mock data modules from production source files', () => {
    const srcRoot = path.resolve(__dirname, '../../');
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'mocks') continue;
          walk(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    walk(path.join(srcRoot, 'app'));
    walk(path.join(srcRoot, 'components'));
    walk(path.join(srcRoot, 'hooks'));
    walk(path.join(srcRoot, 'lib'));
    walk(path.join(srcRoot, 'config'));

    const badFiles = files.filter((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      return (
        content.includes('@/data/mock-data') ||
        content.includes('../data/mock-data') ||
        content.includes("'@/__tests__/") ||
        content.includes('"@/__tests__/')
      );
    });

    expect(badFiles).toEqual([]);
  });

  it('does not generate fabricated wallet/tx data with Math.random in production source', () => {
    const srcRoot = path.resolve(__dirname, '../../');
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'mocks') continue;
          walk(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    walk(path.join(srcRoot, 'app'));
    walk(path.join(srcRoot, 'components'));
    walk(path.join(srcRoot, 'hooks'));
    walk(path.join(srcRoot, 'lib'));
    walk(path.join(srcRoot, 'config'));

    const badFiles = files.filter((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      return content.includes('Math.random()') || content.includes('Math.random');
    });

    expect(badFiles).toEqual([]);
  });
});
