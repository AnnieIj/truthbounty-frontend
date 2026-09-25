import {
  abiHasFunction,
  encodeWithdrawTreasuryCall,
  evaluateAccessGate,
  markBalanceStaleness,
  validateWithdrawalDraft,
} from '@/lib/treasury/safe-withdrawal';
import { TREASURY_TYPED_CONFIRM_PHRASE } from '@/app/types/treasury';

const ADMIN = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CONTRACT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const WITHDRAW_ABI = [
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
] as const;

describe('safe treasury withdrawal helpers', () => {
  it('detects withdrawTreasury on ABI', () => {
    expect(abiHasFunction(WITHDRAW_ABI, 'withdrawTreasury')).toBe(true);
    expect(abiHasFunction([], 'withdrawTreasury')).toBe(false);
  });

  it('fails closed for non-admin and wrong chain', () => {
    const unauthorized = evaluateAccessGate({
      walletAddress: OTHER,
      chainId: 10,
      abi: WITHDRAW_ABI,
      roles: { admin: ADMIN },
      contractAddress: CONTRACT,
    });
    expect(unauthorized.isAdmin).toBe(false);
    expect(unauthorized.blockReason).toMatch(/not the canonical treasury admin/i);

    const wrongChain = evaluateAccessGate({
      walletAddress: ADMIN,
      chainId: 1,
      abi: WITHDRAW_ABI,
      roles: { admin: ADMIN },
      contractAddress: CONTRACT,
    });
    expect(wrongChain.chainSupported).toBe(false);
    expect(wrongChain.blockReason).toMatch(/Unsupported chain/i);
  });

  it('fails closed when ABI lacks withdrawTreasury', () => {
    const gate = evaluateAccessGate({
      walletAddress: ADMIN,
      chainId: 11155420,
      abi: [{ type: 'function', name: 'balanceOf', inputs: [], outputs: [] }],
      roles: { admin: ADMIN },
      contractAddress: CONTRACT,
    });
    expect(gate.abiSupportsWithdraw).toBe(false);
    expect(gate.blockReason).toMatch(/fail closed/i);
  });

  it('allows canonical admin on OP Sepolia when ABI is ready', () => {
    const gate = evaluateAccessGate({
      walletAddress: ADMIN,
      chainId: 11155420,
      abi: WITHDRAW_ABI,
      roles: { admin: ADMIN },
      contractAddress: CONTRACT,
    });
    expect(gate.blockReason).toBeNull();
    expect(gate.isAdmin).toBe(true);
  });

  it('marks stale balances and validates amount bounds', () => {
    const fresh = markBalanceStaleness({
      amountWei: '1000',
      fetchedAt: new Date().toISOString(),
      chainId: 11155420,
      contractAddress: CONTRACT,
    });
    expect(fresh.isStale).toBe(false);

    const stale = markBalanceStaleness(
      {
        amountWei: '1000',
        fetchedAt: new Date(Date.now() - 120_000).toISOString(),
        chainId: 11155420,
        contractAddress: CONTRACT,
      },
      Date.now(),
    );
    expect(stale.isStale).toBe(true);

    const over = validateWithdrawalDraft(
      { recipient: ADMIN, amountWei: '2000' },
      fresh,
    );
    expect(over.ok).toBe(false);
    expect(over.errors.join(' ')).toMatch(/exceeds/i);

    const ok = validateWithdrawalDraft(
      { recipient: ADMIN, amountWei: '500' },
      fresh,
      TREASURY_TYPED_CONFIRM_PHRASE,
      true,
    );
    expect(ok.ok).toBe(true);
  });

  it('requires typed confirm phrase', () => {
    const balance = markBalanceStaleness({
      amountWei: '1000',
      fetchedAt: new Date().toISOString(),
      chainId: 10,
      contractAddress: CONTRACT,
    });
    const bad = validateWithdrawalDraft(
      { recipient: ADMIN, amountWei: '1' },
      balance,
      'withdraw',
      true,
    );
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/WITHDRAW/);
  });

  it('encodes withdrawTreasury calldata without fabricating hashes', () => {
    const data = encodeWithdrawTreasuryCall({
      abi: WITHDRAW_ABI,
      recipient: ADMIN,
      amountWei: '42',
    });
    expect(data.startsWith('0x')).toBe(true);
    expect(data.length).toBeGreaterThan(10);
    expect(() =>
      encodeWithdrawTreasuryCall({
        abi: [],
        recipient: ADMIN,
        amountWei: '42',
      }),
    ).toThrow(/fail closed/i);
  });

  it('rejects zero / placeholder recipients', () => {
    const balance = markBalanceStaleness({
      amountWei: '1000',
      fetchedAt: new Date().toISOString(),
      chainId: 10,
      contractAddress: CONTRACT,
    });
    const zero = validateWithdrawalDraft(
      { recipient: '0x0000000000000000000000000000000000000000', amountWei: '1' },
      balance,
    );
    expect(zero.ok).toBe(false);
  });
});
