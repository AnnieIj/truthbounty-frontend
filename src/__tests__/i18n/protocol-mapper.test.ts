/**
 * V2-FE-070 — Protocol Mapper Tests
 * 
 * Tests for mapping protocol error codes and states to translation keys.
 * Ensures all error codes and states are properly mapped.
 */

import {
  getTransactionErrorKey,
  getTransactionStateKey,
  getTransactionStateDescriptionKey,
  getClaimErrorKey,
  getClaimStatusKey,
  extractErrorParams,
  isFailureState,
  isSuccessState,
  isInProgressState,
  getStateColor,
  getStateIcon,
} from '@/i18n/protocol-mapper';

describe('Transaction Error Mapping', () => {
  test('maps USER_REJECTED error', () => {
    expect(getTransactionErrorKey('USER_REJECTED')).toBe('transaction.errors.USER_REJECTED');
  });

  test('maps WRONG_NETWORK error', () => {
    expect(getTransactionErrorKey('WRONG_NETWORK')).toBe('transaction.errors.WRONG_NETWORK');
  });

  test('maps REVERT error', () => {
    expect(getTransactionErrorKey('REVERT')).toBe('transaction.errors.REVERT');
  });

  test('maps DROPPED error', () => {
    expect(getTransactionErrorKey('DROPPED')).toBe('transaction.errors.DROPPED');
  });

  test('maps STALE_RECEIPT error', () => {
    expect(getTransactionErrorKey('STALE_RECEIPT')).toBe('transaction.errors.STALE_RECEIPT');
  });

  test('maps INVALID_TRANSITION error', () => {
    expect(getTransactionErrorKey('INVALID_TRANSITION')).toBe('transaction.errors.INVALID_TRANSITION');
  });
});

describe('Transaction State Mapping', () => {
  test('maps idle state', () => {
    expect(getTransactionStateKey('idle')).toBe('transaction.states.idle');
  });

  test('maps preparing state', () => {
    expect(getTransactionStateKey('preparing')).toBe('transaction.states.preparing');
  });

  test('maps signature-requested state', () => {
    expect(getTransactionStateKey('signature-requested')).toBe('transaction.states.signatureRequested');
  });

  test('maps submitted state', () => {
    expect(getTransactionStateKey('submitted')).toBe('transaction.states.submitted');
  });

  test('maps confirming state', () => {
    expect(getTransactionStateKey('confirming')).toBe('transaction.states.confirming');
  });

  test('maps finalized state', () => {
    expect(getTransactionStateKey('finalized')).toBe('transaction.states.finalized');
  });

  test('maps reverted state', () => {
    expect(getTransactionStateKey('reverted')).toBe('transaction.states.reverted');
  });
});

describe('Transaction State Description Mapping', () => {
  test('maps state descriptions', () => {
    expect(getTransactionStateDescriptionKey('idle')).toBe('transaction.stateDescriptions.idle');
    expect(getTransactionStateDescriptionKey('preparing')).toBe('transaction.stateDescriptions.preparing');
    expect(getTransactionStateDescriptionKey('finalized')).toBe('transaction.stateDescriptions.finalized');
  });
});

describe('Claim Error Mapping', () => {
  test('maps INVALID_CHAIN error', () => {
    expect(getClaimErrorKey('INVALID_CHAIN')).toBe('claim.errors.INVALID_CHAIN');
  });

  test('maps INVALID_ADDRESS error', () => {
    expect(getClaimErrorKey('INVALID_ADDRESS')).toBe('claim.errors.INVALID_ADDRESS');
  });

  test('maps WALLET_NOT_CONNECTED error', () => {
    expect(getClaimErrorKey('WALLET_NOT_CONNECTED')).toBe('claim.errors.WALLET_NOT_CONNECTED');
  });

  test('maps SIMULATION_REVERTED error', () => {
    expect(getClaimErrorKey('SIMULATION_REVERTED')).toBe('claim.errors.SIMULATION_REVERTED');
  });

  test('maps CLAIM_NOT_INDEXED error', () => {
    expect(getClaimErrorKey('CLAIM_NOT_INDEXED')).toBe('claim.errors.CLAIM_NOT_INDEXED');
  });
});

describe('Claim Status Mapping', () => {
  test('maps idle status', () => {
    expect(getClaimStatusKey('idle')).toBe('claim.status.idle');
  });

  test('maps validating status', () => {
    expect(getClaimStatusKey('validating')).toBe('claim.status.validating');
  });

  test('maps success status', () => {
    expect(getClaimStatusKey('success')).toBe('claim.status.success');
  });

  test('falls back to idle for unknown status', () => {
    expect(getClaimStatusKey('unknown')).toBe('claim.status.idle');
  });
});

describe('Error Parameter Extraction', () => {
  test('extracts chain ID', () => {
    const error = { chainId: 10 };
    const params = extractErrorParams(error);
    expect(params.chainId).toBe(10);
  });

  test('extracts expected and connected chain IDs', () => {
    const error = { expectedChainId: 10, connectedChainId: 1 };
    const params = extractErrorParams(error);
    expect(params.expectedChain).toBe(10);
    expect(params.connectedChain).toBe(1);
  });

  test('extracts address', () => {
    const error = { address: '0x123' };
    const params = extractErrorParams(error);
    expect(params.address).toBe('0x123');
  });

  test('extracts reason', () => {
    const error = { reason: 'Insufficient funds' };
    const params = extractErrorParams(error);
    expect(params.reason).toBe('Insufficient funds');
  });

  test('extracts message', () => {
    const error = { message: 'Transaction failed' };
    const params = extractErrorParams(error);
    expect(params.message).toBe('Transaction failed');
  });

  test('handles non-object errors', () => {
    const params = extractErrorParams(null);
    expect(Object.keys(params).length).toBe(0);
  });

  test('handles undefined values', () => {
    const error = { chainId: undefined, message: 'Error' };
    const params = extractErrorParams(error);
    expect(params.chainId).toBeUndefined();
    expect(params.message).toBe('Error');
  });
});

describe('State Classification', () => {
  test('identifies failure states', () => {
    expect(isFailureState('dropped')).toBe(true);
    expect(isFailureState('replaced')).toBe(true);
    expect(isFailureState('reverted')).toBe(true);
    expect(isFailureState('finalized')).toBe(false);
    expect(isFailureState('idle')).toBe(false);
  });

  test('identifies success states', () => {
    expect(isSuccessState('finalized')).toBe(true);
    expect(isSuccessState('safe')).toBe(false);
    expect(isSuccessState('confirming')).toBe(false);
  });

  test('identifies in-progress states', () => {
    expect(isInProgressState('preparing')).toBe(true);
    expect(isInProgressState('signature-requested')).toBe(true);
    expect(isInProgressState('submitted')).toBe(true);
    expect(isInProgressState('confirming')).toBe(true);
    expect(isInProgressState('safe')).toBe(true);
    expect(isInProgressState('indexing')).toBe(true);
    expect(isInProgressState('idle')).toBe(false);
    expect(isInProgressState('finalized')).toBe(false);
  });
});

describe('State UI Helpers', () => {
  test('returns correct colors for states', () => {
    expect(getStateColor('finalized')).toBe('green');
    expect(getStateColor('reverted')).toBe('red');
    expect(getStateColor('dropped')).toBe('red');
    expect(getStateColor('confirming')).toBe('blue');
    expect(getStateColor('idle')).toBe('gray');
  });

  test('returns correct icons for states', () => {
    expect(getStateIcon('finalized')).toBe('check-circle');
    expect(getStateIcon('reverted')).toBe('x-circle');
    expect(getStateIcon('signature-requested')).toBe('edit');
    expect(getStateIcon('confirming')).toBe('loader');
    expect(getStateIcon('idle')).toBe('circle');
  });
});

describe('Comprehensive Coverage', () => {
  test('all transaction error reasons are mapped', () => {
    const reasons: Array<Parameters<typeof getTransactionErrorKey>[0]> = [
      'USER_REJECTED',
      'WRONG_NETWORK',
      'REVERT',
      'DROPPED',
      'REPLACED',
      'STALE_RECEIPT',
      'INVALID_TRANSITION',
      'INVALID_PERSISTED_STATE',
    ];

    reasons.forEach(reason => {
      const key = getTransactionErrorKey(reason);
      expect(key).toContain('transaction.errors.');
      expect(key).toBeTruthy();
    });
  });

  test('all transaction states are mapped', () => {
    const states: Array<Parameters<typeof getTransactionStateKey>[0]> = [
      'idle',
      'preparing',
      'signature-requested',
      'submitted',
      'confirming',
      'safe',
      'indexing',
      'finalized',
      'dropped',
      'replaced',
      'reverted',
    ];

    states.forEach(state => {
      const key = getTransactionStateKey(state);
      expect(key).toContain('transaction.states.');
      expect(key).toBeTruthy();
    });
  });

  test('all claim error codes are mapped', () => {
    const codes: Array<Parameters<typeof getClaimErrorKey>[0]> = [
      'INVALID_CHAIN',
      'INVALID_ADDRESS',
      'INVALID_CONTENT_DIGEST',
      'INVALID_AMOUNT',
      'INVALID_CONFIG',
      'INVALID_ARTIFACT_VERSION',
      'WALLET_NOT_CONNECTED',
      'USER_REJECTED',
      'SIMULATION_REVERTED',
      'TRANSACTION_REVERTED',
      'TX_NOT_FOUND',
      'ALLOWANCE_INSUFFICIENT',
      'APPROVAL_FAILED',
      'CLAIM_NOT_INDEXED',
      'UNEXPECTED_ERROR',
    ];

    codes.forEach(code => {
      const key = getClaimErrorKey(code);
      expect(key).toContain('claim.errors.');
      expect(key).toBeTruthy();
    });
  });
});
