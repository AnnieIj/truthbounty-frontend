/**
 * Rewards claim logic (V2-FE-118).
 *
 * Pure eligibility/aggregation/status helpers. Asserts fail-closed behaviour on
 * disconnected wallets, unsupported/mismatched chains and empty projections, and
 * that raw wallet/RPC error text is never surfaced to users.
 */

import {
  claimStatusBadge,
  classifyClaimError,
  computeClaimEligibility,
  sumClaimable,
} from '@/lib/rewards-claim';

const RELEASE_CHAIN = 11155420;
const WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';

describe('computeClaimEligibility', () => {
  it('allows a claim when every precondition is met', () => {
    const result = computeClaimEligibility({
      address: WALLET,
      isConnected: true,
      chainId: RELEASE_CHAIN,
      expectedChainId: RELEASE_CHAIN,
      claimableCount: 2,
    });
    expect(result).toEqual({ canClaim: true, reason: null, message: null });
  });

  it('fails closed on a disconnected wallet', () => {
    const result = computeClaimEligibility({
      address: null,
      isConnected: false,
      chainId: RELEASE_CHAIN,
      expectedChainId: RELEASE_CHAIN,
      claimableCount: 2,
    });
    expect(result.canClaim).toBe(false);
    expect(result.reason).toBe('wallet-disconnected');
  });

  it('fails closed on a mismatched chain', () => {
    const result = computeClaimEligibility({
      address: WALLET,
      isConnected: true,
      chainId: 10,
      expectedChainId: RELEASE_CHAIN,
      claimableCount: 2,
    });
    expect(result.reason).toBe('wrong-chain');
    expect(result.message).toContain(String(RELEASE_CHAIN));
  });

  it('fails closed on an unsupported chain', () => {
    const result = computeClaimEligibility({
      address: WALLET,
      isConnected: true,
      chainId: 999999,
      expectedChainId: RELEASE_CHAIN,
      claimableCount: 2,
    });
    expect(result.reason).toBe('wrong-chain');
  });

  it('fails closed on a null chain id', () => {
    const result = computeClaimEligibility({
      address: WALLET,
      isConnected: true,
      chainId: null,
      expectedChainId: RELEASE_CHAIN,
      claimableCount: 2,
    });
    expect(result.reason).toBe('wrong-chain');
  });

  it('blocks while a claim is in progress', () => {
    const result = computeClaimEligibility({
      address: WALLET,
      isConnected: true,
      chainId: RELEASE_CHAIN,
      expectedChainId: RELEASE_CHAIN,
      claimableCount: 2,
      inProgress: true,
    });
    expect(result.reason).toBe('in-progress');
  });

  it('blocks when there is nothing to claim', () => {
    const result = computeClaimEligibility({
      address: WALLET,
      isConnected: true,
      chainId: RELEASE_CHAIN,
      expectedChainId: RELEASE_CHAIN,
      claimableCount: 0,
    });
    expect(result.reason).toBe('no-rewards');
  });
});

describe('sumClaimable', () => {
  it('sums finite amounts and ignores malformed rows', () => {
    expect(
      sumClaimable([
        { id: 'a', amount: 1.5 },
        { id: 'b', amount: '2.25' },
        { id: 'c', amount: Number.NaN },
        { id: 'd', amount: 'not-a-number' },
      ]),
    ).toBe(3.75);
  });

  it('sums an empty projection to zero', () => {
    expect(sumClaimable([])).toBe(0);
  });
});

describe('claimStatusBadge', () => {
  it('maps lifecycle states to a tone + label', () => {
    expect(claimStatusBadge('finalized')).toEqual({ tone: 'success', label: 'Claimed' });
    expect(claimStatusBadge('confirming')).toEqual({ tone: 'confirmed', label: 'Confirming' });
    expect(claimStatusBadge('rejected')).toEqual({ tone: 'warning', label: 'Rejected' });
    expect(claimStatusBadge('reverted')).toEqual({ tone: 'danger', label: 'Reverted' });
    expect(claimStatusBadge('idle')).toEqual({ tone: 'neutral', label: 'Ready' });
  });
});

describe('classifyClaimError', () => {
  it('classifies a user rejection without leaking raw text', () => {
    const result = classifyClaimError(new Error('User rejected the request.'));
    expect(result.status).toBe('rejected');
    expect(result.message).not.toMatch(/rejected the request/i);
  });

  it('classifies an on-chain revert', () => {
    expect(classifyClaimError(new Error('execution reverted')).status).toBe('reverted');
  });

  it('classifies a missing allowance as approval required', () => {
    expect(classifyClaimError(new Error('ERC20: insufficient allowance')).status).toBe(
      'approvalRequired',
    );
  });

  it('falls back to a generic, safe error', () => {
    const result = classifyClaimError(new Error('0xdeadbeef internal rpc failure'));
    expect(result.status).toBe('error');
    expect(result.message).not.toMatch(/0xdeadbeef/);
  });
});
