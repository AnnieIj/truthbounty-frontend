/**
 * Settlement & payout status derivation (V2-FE-117).
 *
 * Enforces the invariants from docs/ux/TRANSACTION_STATE_MODEL.md:
 *   - a timer/loading never yields success;
 *   - `confirmed` is distinguished from `finalized`;
 *   - a reorged receipt removes any success;
 *   - stale critical data fails closed;
 *   - payout text comes only from a real amount.
 */

import { deriveSettlementStatus } from '@/lib/settlement-status';

const HASH = `0x${'ab'.repeat(32)}` as `0x${string}`;

describe('deriveSettlementStatus: precedence & fail-closed', () => {
  it('is loading and never successful while loading', () => {
    const vm = deriveSettlementStatus({ isLoading: true, state: 'SETTLED' });
    expect(vm.phase).toBe('loading');
    expect(vm.tone).toBe('neutral');
    expect(vm.showSuccess).toBe(false);
    expect(vm.explorerLinkable).toBe(false);
  });

  it('treats a reorged receipt as orphaned and removes success', () => {
    const vm = deriveSettlementStatus({
      state: 'SETTLEMENT_CLAIMED',
      finality: 'reorged',
      txHash: HASH,
      chainId: 10,
    });
    expect(vm.phase).toBe('reorged');
    expect(vm.tone).toBe('orphaned');
    expect(vm.showSuccess).toBe(false);
    expect(vm.explorerLinkable).toBe(true);
  });

  it('fails closed on stale data even for a settled state', () => {
    const vm = deriveSettlementStatus({ state: 'SETTLED', isStale: true });
    expect(vm.phase).toBe('stale');
    expect(vm.tone).toBe('warning');
    expect(vm.showSuccess).toBe(false);
  });

  it('is empty when no settlement state exists', () => {
    const vm = deriveSettlementStatus({});
    expect(vm.phase).toBe('empty');
    expect(vm.tone).toBe('neutral');
    expect(vm.showSuccess).toBe(false);
  });
});

describe('deriveSettlementStatus: awaiting states', () => {
  it('renders PENDING_SETTLEMENT as awaiting', () => {
    const vm = deriveSettlementStatus({ state: 'PENDING_SETTLEMENT' });
    expect(vm.phase).toBe('awaiting');
    expect(vm.tone).toBe('pending');
    expect(vm.showSuccess).toBe(false);
  });

  it('renders a submitted (pending finality) tx as submitting', () => {
    const vm = deriveSettlementStatus({
      state: 'PENDING_SETTLEMENT',
      finality: 'pending',
      txHash: HASH,
    });
    expect(vm.phase).toBe('submitting');
    expect(vm.label).toBe('Submitting');
  });

  it('renders a confirmed-but-not-final tx as confirming', () => {
    const vm = deriveSettlementStatus({
      state: 'PENDING_SETTLEMENT',
      finality: 'confirmed',
    });
    expect(vm.phase).toBe('confirmed');
    expect(vm.label).toBe('Confirming');
    expect(vm.showSuccess).toBe(false);
  });
});

describe('deriveSettlementStatus: success states', () => {
  it('shows durable success for SETTLED at finality', () => {
    const vm = deriveSettlementStatus({
      state: 'SETTLED',
      finality: 'finalized',
      payoutWei: 1500000000000000000n,
      symbol: 'TBNT',
    });
    expect(vm.phase).toBe('finalized');
    expect(vm.tone).toBe('finalized');
    expect(vm.showSuccess).toBe(true);
    expect(vm.payoutText).toBe('1.5');
    expect(vm.symbol).toBe('TBNT');
  });

  it('downgrades SETTLED to confirming when not yet final', () => {
    const vm = deriveSettlementStatus({ state: 'SETTLED', finality: 'confirmed' });
    expect(vm.phase).toBe('confirmed');
    expect(vm.tone).toBe('confirmed');
    expect(vm.showSuccess).toBe(false);
  });

  it('renders SETTLEMENT_CLAIMED as paid', () => {
    const vm = deriveSettlementStatus({
      state: 'SETTLEMENT_CLAIMED',
      finality: 'finalized',
    });
    expect(vm.phase).toBe('paid');
    expect(vm.tone).toBe('success');
    expect(vm.showSuccess).toBe(true);
  });

  it('does not fabricate payout text when no amount is supplied', () => {
    const vm = deriveSettlementStatus({ state: 'SETTLED', finality: 'finalized' });
    expect(vm.payoutText).toBeUndefined();
  });

  it('never shows payout for a non-payout state', () => {
    const vm = deriveSettlementStatus({
      state: 'PENDING_SETTLEMENT',
      payoutWei: 1000000000000000000n,
    });
    expect(vm.payoutText).toBeUndefined();
  });
});

describe('deriveSettlementStatus: explorer linkage', () => {
  it('is linkable only with a real hash', () => {
    expect(deriveSettlementStatus({ state: 'SETTLED', txHash: HASH }).explorerLinkable).toBe(
      true,
    );
    expect(deriveSettlementStatus({ state: 'SETTLED' }).explorerLinkable).toBe(false);
  });
});
