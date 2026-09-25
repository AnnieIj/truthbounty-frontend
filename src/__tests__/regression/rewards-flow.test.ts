/**
 * V2-FE-060 — Regression tests for the reward entitlement and claim flow.
 *
 * "Delete-proof" guards: prove that mock/placeholder state, fabricated
 * hashes, hand-authored calldata, and legacy runtimes cannot re-enter the
 * production rewards flow.
 */

import * as fs from 'fs';
import * as path from 'path';

const read = (relative: string): string =>
  fs.readFileSync(path.resolve(__dirname, relative), 'utf-8');

// ---------------------------------------------------------------------------
// 1. Mock data and NotImplemented stubs are gone from the rewards flow
// ---------------------------------------------------------------------------

describe('useRewards — legacy mock pipeline removed', () => {
  it('no longer imports mock-data claimableRewards', () => {
    const content = read('../../hooks/useRewards.ts');
    // Guard against real imports; prose in comments is not a dependency.
    expect(content).not.toMatch(/from\s+['"]@\/data\/mock-data['"]/);
    expect(content).not.toMatch(/import[^\n]*claimableRewards/);
  });

  it('no longer calls the NotImplemented wallet stub', () => {
    const content = read('../../hooks/useRewards.ts');
    expect(content).not.toContain("from '@/app/lib/wallet'");
    expect(content).not.toContain('claimRewards(ids)');
  });

  it('delegates to the canonical V2 hooks', () => {
    const content = read('../../hooks/useRewards.ts');
    expect(content).toContain('useRewardEntitlements');
    expect(content).toContain('useRewardClaim');
  });
});

// ---------------------------------------------------------------------------
// 2. Claim submission never fabricates hashes or hand-authors calldata
// ---------------------------------------------------------------------------

describe('useRewardClaim — fabrication guards', () => {
  it('contains no Math.random, Date.now-based hashes, or fake selectors', () => {
    const content = read('../../hooks/useRewardClaim.ts');
    expect(content).not.toMatch(/Math\.random/);
    expect(content).not.toMatch(/0x\$\{.*padEnd/);
    expect(content).not.toMatch(/0x12345678/);
    expect(content).not.toMatch(/mockTxHash/i);
    expect(content).not.toMatch(/generateTransactionHash/i);
  });

  it('contains no mock gas estimates', () => {
    const content = read('../../hooks/useRewardClaim.ts');
    expect(content).not.toMatch(/250000/);
    expect(content).not.toMatch(/Mock gas/i);
  });

  it('calldata comes only from wagmi/viem writeContractAsync on the release ABI', () => {
    const content = read('../../hooks/useRewardClaim.ts');
    expect(content).toContain('writeContractAsync');
    expect(content).toContain('getContractAbi');
    // encodeFunctionData with hand-built arguments is a fabrication vector in
    // the claim flow; only wagmi encodes the call.
    expect(content).not.toContain('encodeFunctionData');
  });

  it('validates the wallet-returned hash before accepting it', () => {
    const content = read('../../hooks/useRewardClaim.ts');
    expect(content).toMatch(/invalid transaction hash/);
  });

  it('advances lifecycle state only on canonical receipts', () => {
    const content = read('../../hooks/useRewardClaim.ts');
    expect(content).toContain('useWaitForTransactionReceipt');
    expect(content).toContain('reconcileClaimReceipt');
    // No setTimeout-driven success/failure transitions.
    expect(content).not.toMatch(/setTimeout/);
  });
});

// ---------------------------------------------------------------------------
// 3. RewardsPage no longer trusts raw API floats
// ---------------------------------------------------------------------------

describe('RewardsPage — untrusted input handling', () => {
  it('no longer sums raw Number(amount) values from the API', () => {
    const content = read('../../components/RewardsPage.tsx');
    expect(content).not.toMatch(/Number\(reward/);
    expect(content).not.toContain('/api/rewards?user=');
    expect(content).toContain('useRewardEntitlements');
  });
});

// ---------------------------------------------------------------------------
// 4. No legacy/forbidden runtimes anywhere in the new rewards flow
// ---------------------------------------------------------------------------

describe('rewards flow — forbidden runtime dependencies', () => {
  const files = [
    '../../app/types/rewards.ts',
    '../../lib/rewards/validate-entitlements.ts',
    '../../lib/rewards/reconcile-claim.ts',
    '../../app/api/rewards.api.ts',
    '../../hooks/useRewardEntitlements.ts',
    '../../hooks/useRewardClaim.ts',
    '../../hooks/useRewards.ts',
    '../../components/features/ClaimRewardsPanel.tsx',
    '../../components/RewardsPage.tsx',
  ];

  it.each(files)('%s has no Stellar/Soroban/Freighter/simulator imports', (file) => {
    const content = read(file);
    // Guard against actual imports/dependencies, not prose mentions.
    expect(content).not.toMatch(/from\s+['"]@stellar\//);
    expect(content).not.toMatch(/require\(\s*['"]@stellar\//);
    expect(content).not.toMatch(/from\s+['"][^'"]*soroban/i);
    expect(content).not.toMatch(/from\s+['"][^'"]*freighter/i);
    expect(content).not.toMatch(/from\s+['"]@\/lib\/transaction-simulator['"]/);
    expect(content).not.toMatch(/from\s+['"][^'"]*mock-wallet/i);
  });
});

// ---------------------------------------------------------------------------
// 5. The receipt projection only ever derives from receipt-shaped inputs
// ---------------------------------------------------------------------------

describe('reconcile-claim — no synthetic settlement state', () => {
  it('never returns a confirmed projection without a success receipt', async () => {
    const { reconcileClaimReceipt, ERC20_TRANSFER_TOPIC } = await import(
      '@/lib/rewards/reconcile-claim'
    );

    const outcome = reconcileClaimReceipt({
      receipt: {
        transactionHash: `0x${'1'.repeat(64)}` as `0x${string}`,
        status: 'pending',
        blockNumber: 1n,
      },
      contractAddress: '0x3333333333333333333333333333333333333333',
      expectedChainId: 11155420,
      transferTopic: ERC20_TRANSFER_TOPIC,
      requestedEntitlements: [],
      recipient: '0x3333333333333333333333333333333333333333',
    });

    expect(outcome.status).not.toBe('confirmed');
  });
});
