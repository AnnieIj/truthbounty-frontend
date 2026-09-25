/**
 * V2-FE-144 — Unit tests for the pure reorg/replacement reconciliation core.
 *
 * Coverage:
 *  - Chain support guard (fail closed on unsupported chains)
 *  - ROLLBACK payload validation (valid / malformed / unknown-block)
 *  - REPLACEMENT payload validation (valid / malformed / identical cursors)
 *  - markReorged: success paths + idempotence + terminal-state guard
 *  - resolveReorgWithReplacement: success + every documented rejection
 *  - Invalidation plans (rollback global, replacement scoped, cursor rules)
 *  - Banner view derivation (hidden / reorg-detected / unresolved /
 *    replacement-found), including the acknowledgement-independent purity
 *  - Fabrication guards: no hash invention, no client-side success synthesis
 */

import {
  isSupportedReconciliationChain,
  isTxHash,
  validateRollbackEvent,
  validateReplacementEvent,
  markReorged,
  resolveReorgWithReplacement,
  planRollbackInvalidation,
  planReplacementInvalidation,
  buildReorgBannerView,
  buildReplacementBannerView,
  ReorgReconciliationError,
  type TrackedTransaction,
} from '@/lib/reorg-reconciliation';

const VALID_HASH_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const VALID_HASH_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const VALID_HASH_C = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as const;

function submittedTx(overrides: Partial<TrackedTransaction> = {}): TrackedTransaction {
  return {
    hash: VALID_HASH_A,
    chainId: 10,
    status: 'submitted',
    ...overrides,
  };
}

function confirmedTx(overrides: Partial<TrackedTransaction> = {}): TrackedTransaction {
  return submittedTx({ status: 'confirmed', ...overrides });
}

describe('chain support guard', () => {
  it('accepts OP Mainnet and OP Sepolia', () => {
    expect(isSupportedReconciliationChain(10)).toBe(true);
    expect(isSupportedReconciliationChain(11155420)).toBe(true);
  });

  it('rejects every other chain (fail closed)', () => {
    expect(isSupportedReconciliationChain(1)).toBe(false);
    expect(isSupportedReconciliationChain(8453)).toBe(false);
    expect(isSupportedReconciliationChain(31337)).toBe(false);
    expect(isSupportedReconciliationChain(undefined)).toBe(false);
    expect(isSupportedReconciliationChain('10')).toBe(false);
  });
});

describe('hash validation', () => {
  it('accepts 32-byte 0x-prefixed hashes', () => {
    expect(isTxHash(VALID_HASH_A)).toBe(true);
  });

  it('rejects malformed hashes', () => {
    expect(isTxHash('0x1234')).toBe(false);
    expect(isTxHash('not-a-hash')).toBe(false);
    expect(isTxHash(`0x${'g'.repeat(64)}`)).toBe(false);
    expect(isTxHash(undefined)).toBe(false);
    expect(isTxHash(123)).toBe(false);
  });
});

describe('validateRollbackEvent', () => {
  it('accepts a valid rollback payload', () => {
    const result = validateRollbackEvent({
      lastValidCursor: 'cursor-1',
      blockNumber: 100,
      affectedClaimIds: ['claim-1'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.lastValidCursor).toBe('cursor-1');
      expect(result.event.blockNumber).toBe(100);
    }
  });

  it('rejects non-object payloads as malformed', () => {
    expect(validateRollbackEvent(null).ok).toBe(false);
    expect(validateRollbackEvent('rollback').ok).toBe(false);
    expect(validateRollbackEvent(undefined).ok).toBe(false);
  });

  it('rejects missing lastValidCursor as malformed', () => {
    const result = validateRollbackEvent({ blockNumber: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects empty-string cursor as malformed', () => {
    const result = validateRollbackEvent({ lastValidCursor: '', blockNumber: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects missing block number as unknown-block', () => {
    const result = validateRollbackEvent({ lastValidCursor: 'cursor-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unknown-block');
  });

  it('rejects non-integer or negative block numbers as unknown-block', () => {
    expect(validateRollbackEvent({ lastValidCursor: 'c', blockNumber: 1.5 }).ok).toBe(false);
    expect(validateRollbackEvent({ lastValidCursor: 'c', blockNumber: -1 }).ok).toBe(false);
    expect(validateRollbackEvent({ lastValidCursor: 'c', blockNumber: '100' }).ok).toBe(false);
    expect(
      validateRollbackEvent({ lastValidCursor: 'c', blockNumber: Number.POSITIVE_INFINITY }).ok,
    ).toBe(false);
  });
});

describe('validateReplacementEvent', () => {
  it('accepts a valid replacement payload', () => {
    const result = validateReplacementEvent({
      claimId: 'claim-1',
      newData: { txHash: VALID_HASH_B },
      previousCursor: 'cursor-1',
      newCursor: 'cursor-2',
      blockNumber: 101,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.newCursor).toBe('cursor-2');
      expect(result.event.blockNumber).toBe(101);
    }
  });

  it('rejects non-object payloads as malformed', () => {
    expect(validateReplacementEvent(null).ok).toBe(false);
    expect(validateReplacementEvent(42).ok).toBe(false);
  });

  it('rejects missing newData as malformed', () => {
    const result = validateReplacementEvent({
      previousCursor: 'a',
      newCursor: 'b',
      blockNumber: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects missing or empty cursors as malformed', () => {
    expect(
      validateReplacementEvent({ newData: {}, newCursor: 'b', blockNumber: 1 }).ok,
    ).toBe(false);
    expect(
      validateReplacementEvent({ newData: {}, previousCursor: 'a', blockNumber: 1 }).ok,
    ).toBe(false);
    expect(
      validateReplacementEvent({ newData: {}, previousCursor: '', newCursor: 'b', blockNumber: 1 })
        .ok,
    ).toBe(false);
  });

  it('rejects identical previous/new cursors as malformed', () => {
    const result = validateReplacementEvent({
      newData: {},
      previousCursor: 'same',
      newCursor: 'same',
      blockNumber: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects invalid block numbers as unknown-block', () => {
    const result = validateReplacementEvent({
      newData: {},
      previousCursor: 'a',
      newCursor: 'b',
      blockNumber: -5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unknown-block');
  });
});

describe('markReorged', () => {
  it('transitions submitted → reorged and withdraws any replacement', () => {
    const next = markReorged(submittedTx());
    expect(next.status).toBe('reorged');
    expect(next.replacedBy).toBeUndefined();
    expect(next.hash).toBe(VALID_HASH_A);
  });

  it('transitions confirmed → reorged (receipt withdrawn)', () => {
    const next = markReorged(confirmedTx());
    expect(next.status).toBe('reorged');
  });

  it('is idempotent for an already reorged transaction', () => {
    const reorged = markReorged(confirmedTx());
    expect(markReorged(reorged)).toBe(reorged);
  });

  it('preserves the original object (immutable transition)', () => {
    const original = confirmedTx();
    const next = markReorged(original);
    expect(original.status).toBe('confirmed');
    expect(next).not.toBe(original);
  });

  it('refuses to reorg terminal states (replaced/dropped)', () => {
    expect(() => markReorged(submittedTx({ status: 'replaced', replacedBy: VALID_HASH_B })))
      .toThrow(ReorgReconciliationError);
    expect(() => markReorged(submittedTx({ status: 'dropped' }))).toThrow(
      ReorgReconciliationError,
    );
  });

  it('rejects fabricated or invalid hashes', () => {
    expect(() => markReorged(submittedTx({ hash: '0xdead' as `0x${string}` }))).toThrow(
      /INVALID_HASH|32-byte/i,
    );
    expect(() => markReorged(submittedTx({ hash: 'hash' as `0x${string}` }))).toThrow(
      ReorgReconciliationError,
    );
  });

  it('rejects unsupported chains (fail closed)', () => {
    expect(() => markReorged(submittedTx({ chainId: 1 }))).toThrow(/INVALID_CHAIN|supported/i);
    expect(() => markReorged(submittedTx({ chainId: 8453 }))).toThrow(ReorgReconciliationError);
  });
});

describe('resolveReorgWithReplacement', () => {
  it('closes a reorged transaction with the canonical replacement hash', () => {
    const reorged = markReorged(confirmedTx());
    const next = resolveReorgWithReplacement(reorged, VALID_HASH_B);
    expect(next.status).toBe('replaced');
    expect(next.replacedBy).toBe(VALID_HASH_B);
    expect(next.hash).toBe(VALID_HASH_A);
  });

  it('normalizes the replacement hash case', () => {
    const reorged = markReorged(confirmedTx());
    const upper = ('0x' + 'B'.repeat(64)) as `0x${string}`;
    const next = resolveReorgWithReplacement(reorged, upper);
    expect(next.replacedBy).toBe(VALID_HASH_B);
  });

  it('refuses non-reorged transactions', () => {
    try {
      resolveReorgWithReplacement(submittedTx(), VALID_HASH_B);
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(ReorgReconciliationError);
      expect((err as ReorgReconciliationError).code).toBe('NOT_REORGED');
    }
    expect(() => resolveReorgWithReplacement(confirmedTx(), VALID_HASH_B)).toThrow(
      /reorged/,
    );
    expect(() =>
      resolveReorgWithReplacement(submittedTx({ status: 'replaced', replacedBy: VALID_HASH_C }), VALID_HASH_B),
    ).toThrow(ReorgReconciliationError);
  });

  it('refuses a replacement identical to the orphaned hash', () => {
    const reorged = markReorged(confirmedTx());
    expect(() => resolveReorgWithReplacement(reorged, VALID_HASH_A)).toThrow(
      /must differ from the orphaned/i,
    );
  });

  it('refuses malformed replacement hashes (no fabrication)', () => {
    const reorged = markReorged(confirmedTx());
    expect(() => resolveReorgWithReplacement(reorged, '0x1234' as `0x${string}`)).toThrow(
      /INVALID_REPLACEMENT|32-byte/i,
    );
    expect(() => resolveReorgWithReplacement(reorged, undefined as unknown as `0x${string}`)).toThrow(
      ReorgReconciliationError,
    );
  });
});

describe('planRollbackInvalidation', () => {
  it('invalidates every projection root and resets the cursor', () => {
    const plan = planRollbackInvalidation({
      lastValidCursor: 'cursor-7',
      blockNumber: 100,
      affectedClaimIds: ['claim-1', 'claim-2'],
      affectedVerificationIds: ['ver-1'],
    });
    expect(plan.queryKeyRoots).toEqual(['claims', 'verifications', 'disputes', 'leaderboard', 'user']);
    expect(plan.affectedClaimIds).toEqual(['claim-1', 'claim-2']);
    expect(plan.affectedVerificationIds).toEqual(['ver-1']);
    expect(plan.resetCursor).toBe(true);
    expect(plan.resumeCursor).toBe('cursor-7');
  });

  it('deduplicates and drops malformed affected ids', () => {
    const plan = planRollbackInvalidation({
      lastValidCursor: 'c',
      blockNumber: 1,
      affectedClaimIds: ['claim-1', 'claim-1', '', 42 as unknown as string],
    });
    expect(plan.affectedClaimIds).toEqual(['claim-1']);
  });

  it('tolerates absent affected id lists', () => {
    const plan = planRollbackInvalidation({ lastValidCursor: 'c', blockNumber: 1 });
    expect(plan.affectedClaimIds).toEqual([]);
    expect(plan.affectedVerificationIds).toEqual([]);
  });
});

describe('planReplacementInvalidation', () => {
  it('scopes invalidation to the affected claim when provided', () => {
    const plan = planReplacementInvalidation({
      claimId: 'claim-9',
      verificationId: 'ver-9',
      newData: {},
      previousCursor: 'a',
      newCursor: 'b',
      blockNumber: 5,
    });
    expect(plan.queryKeyRoots).toEqual(['claims', 'verifications']);
    expect(plan.affectedClaimIds).toEqual(['claim-9']);
    expect(plan.affectedVerificationIds).toEqual(['ver-9']);
    expect(plan.resetCursor).toBe(false);
    expect(plan.resumeCursor).toBe('b');
  });

  it('invalidates only the claim feed when no claim is referenced', () => {
    const plan = planReplacementInvalidation({
      newData: {},
      previousCursor: 'a',
      newCursor: 'b',
      blockNumber: 5,
    });
    expect(plan.queryKeyRoots).toEqual(['claims']);
    expect(plan.affectedClaimIds).toEqual([]);
    expect(plan.resetCursor).toBe(false);
  });
});

describe('buildReorgBannerView', () => {
  it('is hidden when nothing is tracked', () => {
    const view = buildReorgBannerView(null);
    expect(view.state).toBe('hidden');
    expect(view.assertive).toBe(false);
    expect(view.orphanedHash).toBeNull();
  });

  it('is hidden for non-reorged tracked transactions (no fabricated uncertainty)', () => {
    expect(buildReorgBannerView(submittedTx()).state).toBe('hidden');
    expect(buildReorgBannerView(confirmedTx()).state).toBe('hidden');
  });

  it('reports reorg-detected with the orphaned hash', () => {
    const reorged = markReorged(confirmedTx());
    const view = buildReorgBannerView(reorged);
    expect(view.state).toBe('reorg-detected');
    expect(view.assertive).toBe(true);
    expect(view.orphanedHash).toBe(VALID_HASH_A);
    expect(view.replacementHash).toBeNull();
    expect(view.message).toMatch(/reorg/i);
    expect(view.detail).toMatch(/withdrawn|no longer valid/i);
  });

  it('reports unresolved when reconciliation failed', () => {
    const view = buildReorgBannerView(submittedTx(), { reconciliationFailed: true });
    expect(view.state).toBe('unresolved');
    expect(view.assertive).toBe(true);
    expect(view.detail).toMatch(/stale/i);
  });

  it('reports unresolved even when a transaction exists but reconciliation failed', () => {
    const reorged = markReorged(confirmedTx());
    const view = buildReorgBannerView(reorged, { reconciliationFailed: true });
    expect(view.state).toBe('unresolved');
  });

  it('reports reorg-detected for a validated rollback without a tracked transaction', () => {
    const view = buildReorgBannerView(null, { rollbackDetected: true });
    expect(view.state).toBe('reorg-detected');
    expect(view.assertive).toBe(true);
    expect(view.orphanedHash).toBeNull();
    expect(view.detail).toMatch(/canonical chain/i);
  });

  it('prefers the tracked reorged transaction over the generic rollback notice', () => {
    const reorged = markReorged(confirmedTx());
    const view = buildReorgBannerView(reorged, { rollbackDetected: true });
    expect(view.state).toBe('reorg-detected');
    expect(view.orphanedHash).toBe(VALID_HASH_A);
  });
});

describe('buildReplacementBannerView', () => {
  it('reports replacement-found with both hashes', () => {
    const view = buildReplacementBannerView(VALID_HASH_A, VALID_HASH_B);
    expect(view.state).toBe('replacement-found');
    expect(view.assertive).toBe(true);
    expect(view.orphanedHash).toBe(VALID_HASH_A);
    expect(view.replacementHash).toBe(VALID_HASH_B);
    expect(view.detail).toMatch(/superseded/i);
  });

  it('fails closed on a malformed replacement hash', () => {
    const view = buildReplacementBannerView(VALID_HASH_A, '0xbad' as `0x${string}`);
    expect(view.state).toBe('unresolved');
    expect(view.replacementHash).toBeNull();
  });
});

describe('fabrication guards', () => {
  it('never synthesizes a replacement hash', () => {
    const reorged = markReorged(confirmedTx());
    const view = buildReorgBannerView(reorged);
    expect(view.replacementHash).toBeNull();
  });

  it('never marks a transaction finalized client-side', () => {
    const reorged = markReorged(confirmedTx());
    const next = resolveReorgWithReplacement(reorged, VALID_HASH_B);
    expect(next.status).toBe('replaced');
    expect(next.status).not.toBe('finalized');
    expect(next.status).not.toBe('confirmed');
  });
});
