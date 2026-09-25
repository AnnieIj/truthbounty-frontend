/**
 * Pure Stake & Treasury Withdrawal logic tests (V2-FE-061).
 */

import {
  classifyWithdrawalError,
  encodePullWithdrawalCall,
  evaluateStakeTreasuryGate,
  hasUnlockedBalance,
  isSupportedWithdrawalAsset,
  isTerminalOutcome,
  markBalanceViewStaleness,
  summarizeOutcomes,
  validateRecipients,
} from '@/lib/treasury/stake-withdrawal';
import type {
  RecipientOutcome,
  StakeTreasuryBalanceView,
  StakeTreasuryRecipientRow,
} from '@/app/types/stake-treasury';

const ADMIN = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;
const OTHER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const;
const CONTRACT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

const ABI = [
  {
    type: 'function',
    name: 'withdrawTreasury',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'treasuryBalance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

function balance(overrides: Partial<StakeTreasuryBalanceView> = {}): StakeTreasuryBalanceView {
  return {
    reservedWei: '1000000000000000000',
    unlockedWei: '5000000000000000000',
    minBondWei: '1000000000000000000',
    fetchedAt: new Date().toISOString(),
    isStale: false,
    chainId: 11155420,
    contractAddress: CONTRACT,
    ...overrides,
  };
}

function row(overrides: Partial<StakeTreasuryRecipientRow> = {}): StakeTreasuryRecipientRow {
  return { id: 'r1', recipient: ADMIN, amountWei: '1000', asset: 'native', ...overrides };
}

describe('asset handling', () => {
  it('only accepts the canonical native asset', () => {
    expect(isSupportedWithdrawalAsset('native')).toBe(true);
    expect(isSupportedWithdrawalAsset('erc20')).toBe(false);
    expect(isSupportedWithdrawalAsset(undefined)).toBe(false);
  });
});

describe('markBalanceViewStaleness', () => {
  it('flags snapshots older than the threshold without changing values', () => {
    const fresh = markBalanceViewStaleness(
      { ...balance(), fetchedAt: new Date(1000).toISOString() },
      1000,
    );
    expect(fresh.isStale).toBe(false);

    const stale = markBalanceViewStaleness(
      { ...balance(), fetchedAt: new Date(1000).toISOString() },
      1000 + 120_000,
    );
    expect(stale.isStale).toBe(true);
    expect(stale.unlockedWei).toBe('5000000000000000000');
  });
});

describe('evaluateStakeTreasuryGate', () => {
  it('allows the canonical admin on a supported chain', () => {
    const gate = evaluateStakeTreasuryGate({
      walletAddress: ADMIN,
      chainId: 11155420,
      abi: ABI,
      adminAddress: ADMIN,
      contractAddress: CONTRACT,
    });
    expect(gate.blockReason).toBeNull();
    expect(gate.isAdmin).toBe(true);
    expect(gate.configComplete).toBe(true);
  });

  it('fails closed for a non-admin', () => {
    const gate = evaluateStakeTreasuryGate({
      walletAddress: OTHER,
      chainId: 11155420,
      abi: ABI,
      adminAddress: ADMIN,
      contractAddress: CONTRACT,
    });
    expect(gate.isAdmin).toBe(false);
    expect(gate.blockReason).toMatch(/admin/i);
  });

  it('fails closed on an unsupported chain', () => {
    const gate = evaluateStakeTreasuryGate({
      walletAddress: ADMIN,
      chainId: 1,
      abi: ABI,
      adminAddress: ADMIN,
      contractAddress: CONTRACT,
    });
    expect(gate.chainSupported).toBe(false);
    expect(gate.blockReason).toMatch(/unsupported chain/i);
  });

  it('fails closed when the ABI lacks withdrawTreasury', () => {
    const gate = evaluateStakeTreasuryGate({
      walletAddress: ADMIN,
      chainId: 11155420,
      abi: [{ type: 'function', name: 'treasuryBalance' }],
      adminAddress: ADMIN,
      contractAddress: CONTRACT,
    });
    expect(gate.abiSupportsWithdraw).toBe(false);
    expect(gate.blockReason).toMatch(/abi/i);
  });
});

describe('validateRecipients', () => {
  it('accepts a valid single row within balance', () => {
    const result = validateRecipients([row()], balance());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.rowErrors).toEqual({});
  });

  it('fails closed when balance is unavailable', () => {
    const result = validateRecipients([row()], null);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/unavailable/i);
  });

  it('reports invalid addresses and zero amounts per row', () => {
    const result = validateRecipients(
      [
        row({ id: 'a', recipient: 'not-an-address' }),
        row({ id: 'b', amountWei: '0' }),
      ],
      balance(),
    );
    expect(result.ok).toBe(false);
    expect(result.rowErrors.a.join(' ')).toMatch(/recipient/i);
    expect(result.rowErrors.b.join(' ')).toMatch(/greater than zero/i);
  });

  it('rejects unsupported assets', () => {
    const result = validateRecipients(
      [row({ asset: 'erc20' as unknown as 'native' })],
      balance(),
    );
    expect(result.ok).toBe(false);
    expect(result.rowErrors.r1.join(' ')).toMatch(/unsupported asset/i);
  });

  it('rejects totals that exceed the unlocked balance', () => {
    const result = validateRecipients(
      [row({ id: 'a', amountWei: '3000' }), row({ id: 'b', recipient: OTHER, amountWei: '3000' })],
      balance({ unlockedWei: '5000' }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/exceeds/i);
  });

  it('warns on duplicate recipients and stale balances', () => {
    const result = validateRecipients(
      [row({ id: 'a' }), row({ id: 'b', amountWei: '1' })],
      balance({ isStale: true }),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/more than once/i);
    expect(result.warnings.join(' ')).toMatch(/stale/i);
  });

  it('requires at least one recipient', () => {
    const result = validateRecipients([], balance());
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/at least one recipient/i);
  });
});

describe('encodePullWithdrawalCall', () => {
  it('encodes the canonical withdrawTreasury call', () => {
    const data = encodePullWithdrawalCall({
      abi: ABI,
      recipient: ADMIN,
      amountWei: '1000',
    });
    expect(data.startsWith('0x')).toBe(true);
    // Selector for withdrawTreasury(address,uint256) must be present.
    expect(data.length).toBeGreaterThan(10);
  });

  it('fails closed when the ABI is missing the function', () => {
    expect(() =>
      encodePullWithdrawalCall({
        abi: [{ type: 'function', name: 'balanceOf' }],
        recipient: ADMIN,
        amountWei: '1000',
      }),
    ).toThrow(/fail closed/i);
  });

  it('fails closed on an invalid amount', () => {
    expect(() =>
      encodePullWithdrawalCall({ abi: ABI, recipient: ADMIN, amountWei: '0' }),
    ).toThrow(/fail closed/i);
  });
});

describe('classifyWithdrawalError', () => {
  it('classifies wallet rejection', () => {
    expect(classifyWithdrawalError(new Error('User rejected the request')).status).toBe('rejected');
  });

  it('classifies a revert as failed without leaking raw text', () => {
    const result = classifyWithdrawalError(new Error('execution reverted: nope'));
    expect(result.status).toBe('failed');
    expect(result.message).not.toMatch(/nope/);
  });
});

describe('summarizeOutcomes', () => {
  function outcome(
    id: string,
    status: RecipientOutcome['status'],
  ): RecipientOutcome {
    return {
      id,
      recipient: ADMIN,
      amountWei: '1',
      status,
      txHash: null,
      chainId: 11155420,
      confirmations: null,
    };
  }

  it('reports a partial batch without asserting overall success', () => {
    const summary = summarizeOutcomes([
      outcome('a', 'confirmed'),
      outcome('b', 'failed'),
    ]);
    expect(summary.partial).toBe(true);
    expect(summary.confirmed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.allSettled).toBe(true);
    expect(summary.anyIndeterminate).toBe(false);
  });

  it('treats submitted rows as indeterminate', () => {
    const summary = summarizeOutcomes([
      outcome('a', 'confirmed'),
      outcome('b', 'submitted'),
    ]);
    expect(summary.allSettled).toBe(false);
    expect(summary.anyIndeterminate).toBe(true);
    expect(summary.pending).toBe(1);
  });

  it('counts finalized as confirmed', () => {
    const summary = summarizeOutcomes([outcome('a', 'finalized')]);
    expect(summary.confirmed).toBe(1);
    expect(summary.partial).toBe(false);
  });
});

describe('isTerminalOutcome / hasUnlockedBalance', () => {
  it('classifies terminal states', () => {
    expect(isTerminalOutcome('confirmed')).toBe(true);
    expect(isTerminalOutcome('failed')).toBe(true);
    expect(isTerminalOutcome('submitted')).toBe(false);
    expect(isTerminalOutcome('idle')).toBe(false);
  });

  it('detects a positive unlocked balance only', () => {
    expect(hasUnlockedBalance(balance({ unlockedWei: '1' }))).toBe(true);
    expect(hasUnlockedBalance(balance({ unlockedWei: '0' }))).toBe(false);
    expect(hasUnlockedBalance(balance({ unlockedWei: null }))).toBe(false);
    expect(hasUnlockedBalance(null)).toBe(false);
  });
});
