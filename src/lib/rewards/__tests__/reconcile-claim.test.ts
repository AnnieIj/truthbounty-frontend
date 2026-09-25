/**
 * Unit tests for reward claim receipt reconciliation — V2-FE-060
 *
 * Canonical receipts drive lifecycle state. These tests prove that
 * reconciliation: decodes multiple/partial asset receipts, fails closed on
 * reverted/malformed/cross-chain receipts, and never invents amounts.
 */

import {
  ERC20_TRANSFER_TOPIC,
  extractClaimedTransfers,
  explainAllocationCategories,
  reconcileClaimReceipt,
} from '../reconcile-claim';
import type { RewardEntitlement } from '@/app/types/rewards';
import { validateRewardEntitlement } from '../validate-entitlements';

const CONTRACT = '0x3333333333333333333333333333333333333333';
const TOKEN_1 = '0x4444444444444444444444444444444444444444';
const TOKEN_2 = '0x5555555555555555555555555555555555555555';
const CLAIMER = '0x6666666666666666666666666666666666666666';
const OTHER = '0x7777777777777777777777777777777777777777';
const TX_HASH = `0x${'c'.repeat(64)}` as `0x${string}`;
const CLAIM_ID = `0x${'a'.repeat(64)}` as `0x${string}`;

function transferLog(
  token: string,
  to: string,
  amount: bigint,
): { address: string; topics: `0x${string}`[]; data: `0x${string}` } {
  const toTopic = `0x${to.toLowerCase().replace('0x', '').padStart(64, '0')}` as `0x${string}`;
  return {
    address: token,
    topics: [
      ERC20_TRANSFER_TOPIC,
      `0x${'0'.repeat(64)}` as `0x${string}`,
      toTopic,
    ],
    data: `0x${amount.toString(16).padStart(64, '0')}` as `0x${string}`,
  };
}

function entitlement(
  overrides: Partial<Record<string, unknown>> = {},
): RewardEntitlement {
  const validated = validateRewardEntitlement({
    claimId: CLAIM_ID,
    category: 'verification_reward',
    amount: '1000000000000000000',
    asset: TOKEN_1,
    decimals: 18,
    claimable: true,
    ...overrides,
  });
  if (!validated) throw new Error('test entitlement failed validation');
  return validated;
}

function baseReceipt() {
  return {
    transactionHash: TX_HASH,
    status: 'success' as const,
    blockNumber: 100n,
    chainId: 11155420,
    to: CONTRACT,
    logs: [] as ReturnType<typeof transferLog>[],
  };
}

describe('extractClaimedTransfers', () => {
  it('decodes a single Transfer to the claimer', () => {
    const receipt = {
      ...baseReceipt(),
      logs: [transferLog(TOKEN_1, CLAIMER, 1_000n)],
    };
    expect(extractClaimedTransfers(receipt, CLAIMER)).toEqual([
      { asset: TOKEN_1, amount: 1_000n },
    ]);
  });

  it('aggregates multiple transfers of the same asset', () => {
    const receipt = {
      ...baseReceipt(),
      logs: [
        transferLog(TOKEN_1, CLAIMER, 600n),
        transferLog(TOKEN_1, CLAIMER, 400n),
      ],
    };
    expect(extractClaimedTransfers(receipt, CLAIMER)).toEqual([
      { asset: TOKEN_1, amount: 1_000n },
    ]);
  });

  it('separates multiple distinct assets (multiple asset receipts)', () => {
    const receipt = {
      ...baseReceipt(),
      logs: [
        transferLog(TOKEN_2, CLAIMER, 5n),
        transferLog(TOKEN_1, CLAIMER, 1_000n),
      ],
    };
    const transfers = extractClaimedTransfers(receipt, CLAIMER);
    expect(transfers).toHaveLength(2);
    expect(transfers.map((t) => t.asset)).toEqual([TOKEN_1, TOKEN_2]);
  });

  it('ignores transfers to other recipients', () => {
    const receipt = {
      ...baseReceipt(),
      logs: [transferLog(TOKEN_1, OTHER, 1_000n)],
    };
    expect(extractClaimedTransfers(receipt, CLAIMER)).toEqual([]);
  });

  it('ignores non-Transfer topics and malformed logs (untrusted input)', () => {
    const receipt = {
      ...baseReceipt(),
      logs: [
        {
          address: TOKEN_1,
          topics: [`0x${'9'.repeat(64)}` as `0x${string}`, `0x${'0'.repeat(64)}` as `0x${string}`, `0x${'0'.repeat(64)}` as `0x${string}`],
          data: `0x${'1'.padStart(64, '0')}` as `0x${string}`,
        },
        transferLog(TOKEN_1, CLAIMER, 1_000n),
      ],
    };
    expect(extractClaimedTransfers(receipt, CLAIMER)).toEqual([
      { asset: TOKEN_1, amount: 1_000n },
    ]);
  });
});

describe('reconcileClaimReceipt', () => {
  it('produces a canonical projection from a confirmed receipt', () => {
    const requested = [entitlement()];
    const receipt = {
      ...baseReceipt(),
      logs: [transferLog(TOKEN_1, CLAIMER, 1_000_000_000_000_000_000n)],
    };

    const outcome = reconcileClaimReceipt({
      receipt,
      contractAddress: CONTRACT,
      expectedChainId: 11155420,
      transferTopic: ERC20_TRANSFER_TOPIC,
      requestedEntitlements: requested,
      recipient: CLAIMER,
    });

    expect(outcome.status).toBe('confirmed');
    if (outcome.status !== 'confirmed') return;
    expect(outcome.projection.transactionHash).toBe(TX_HASH);
    expect(outcome.projection.chainId).toBe(11155420);
    expect(outcome.projection.blockNumber).toBe(100n);
    expect(outcome.projection.contractAddress).toBe(CONTRACT);
    expect(outcome.projection.receivedAssets).toEqual([
      { asset: TOKEN_1, amount: 1_000_000_000_000_000_000n },
    ]);
    expect(outcome.projection.settledClaimIds).toEqual([CLAIM_ID]);
    expect(outcome.projection.outstandingClaimIds).toEqual([]);
  });

  it('classifies partial receipts as outstanding (never overclaims)', () => {
    const requested = [
      entitlement(),
      entitlement({
        claimId: `0x${'b'.repeat(64)}`,
        asset: TOKEN_1,
        amount: '500000000000000000',
      }),
    ];
    const receipt = {
      ...baseReceipt(),
      logs: [transferLog(TOKEN_1, CLAIMER, 1_000_000_000_000_000_000n)],
    };

    const outcome = reconcileClaimReceipt({
      receipt,
      contractAddress: CONTRACT,
      expectedChainId: 11155420,
      transferTopic: ERC20_TRANSFER_TOPIC,
      requestedEntitlements: requested,
      recipient: CLAIMER,
    });

    expect(outcome.status).toBe('confirmed');
    if (outcome.status !== 'confirmed') return;
    expect(outcome.projection.settledClaimIds).toEqual([]);
    expect(outcome.projection.outstandingClaimIds).toEqual([
      CLAIM_ID,
      `0x${'b'.repeat(64)}`,
    ]);
  });

  it('fails closed on a reverted receipt', () => {
    const outcome = reconcileClaimReceipt({
      receipt: { ...baseReceipt(), status: 'reverted' },
      contractAddress: CONTRACT,
      expectedChainId: 11155420,
      transferTopic: ERC20_TRANSFER_TOPIC,
      requestedEntitlements: [entitlement()],
      recipient: CLAIMER,
    });
    expect(outcome.status).toBe('reverted');
    if (outcome.status !== 'reverted') return;
    expect(outcome.transactionHash).toBe(TX_HASH);
    expect(outcome.reason).toContain('reverted');
  });

  it('fails closed on a cross-chain receipt', () => {
    const outcome = reconcileClaimReceipt({
      receipt: { ...baseReceipt(), chainId: 1 },
      contractAddress: CONTRACT,
      expectedChainId: 11155420,
      transferTopic: ERC20_TRANSFER_TOPIC,
      requestedEntitlements: [entitlement()],
      recipient: CLAIMER,
    });
    expect(outcome.status).toBe('invalid');
  });

  it('fails closed when the receipt is from a different contract', () => {
    const outcome = reconcileClaimReceipt({
      receipt: { ...baseReceipt(), to: OTHER },
      contractAddress: CONTRACT,
      expectedChainId: 11155420,
      transferTopic: ERC20_TRANSFER_TOPIC,
      requestedEntitlements: [entitlement()],
      recipient: CLAIMER,
    });
    expect(outcome.status).toBe('invalid');
    if (outcome.status !== 'invalid') return;
    expect(outcome.reason).toContain('canonical claim contract');
  });

  it('fails closed on receipts missing a canonical destination', () => {
    const { to: _to, ...receipt } = baseReceipt();
    const outcome = reconcileClaimReceipt({
      receipt,
      contractAddress: CONTRACT,
      expectedChainId: 11155420,
      transferTopic: ERC20_TRANSFER_TOPIC,
      requestedEntitlements: [entitlement()],
      recipient: CLAIMER,
    });
    expect(outcome.status).toBe('invalid');
  });

  it('fails closed on receipts missing block numbers', () => {
    const receipt = baseReceipt();
    const outcome = reconcileClaimReceipt({
      receipt: { ...receipt, blockNumber: undefined as unknown as bigint },
      contractAddress: CONTRACT,
      expectedChainId: 11155420,
      transferTopic: ERC20_TRANSFER_TOPIC,
      requestedEntitlements: [entitlement()],
      recipient: CLAIMER,
    });
    expect(outcome.status).toBe('invalid');
  });
});

describe('explainAllocationCategories', () => {
  it('returns explanations for each provided category', () => {
    const explanations = explainAllocationCategories([
      'verification_reward',
      'dispute_bond_refund',
    ]);
    expect(explanations).toHaveLength(2);
    expect(explanations[0].explanation).toContain('verification');
    expect(explanations[1].explanation).toContain('bond');
  });
});
