import {
  evaluateWriteTarget,
  assertWriteReady,
  WriteGateError,
  mapGateFailureToMachineReason,
  resolveCanonicalTargetAddress,
  resolveExpectedChainId,
  type WriteGateInput,
} from '@/lib/contracts/write-gate';

const VALID_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const VALID_TARGET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const PLACEHOLDER = '0xYourContractAddressPlaceholder0000000000';

function readyInput(overrides: Partial<WriteGateInput> = {}): WriteGateInput {
  return {
    account: VALID_ACCOUNT,
    chainId: 11155420,
    expectedChainId: 11155420,
    targetAddress: VALID_TARGET,
    ...overrides,
  };
}

describe('evaluateWriteTarget', () => {
  it('returns ready for a valid Optimism account and target', () => {
    const result = evaluateWriteTarget(readyInput());
    expect(result.ready).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.reason).toBeNull();
  });

  it('fails closed when the wallet is disconnected', () => {
    const result = evaluateWriteTarget(readyInput({ account: null }));
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('WALLET_DISCONNECTED');
    expect(result.failures[0]?.blocking).toBe(true);
    expect(result.reason).toMatch(/connect a wallet/i);
  });

  it('fails closed when the chain is unknown', () => {
    const result = evaluateWriteTarget(readyInput({ chainId: null }));
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('CHAIN_UNSUPPORTED');
  });

  it('fails closed on an unsupported chain', () => {
    const result = evaluateWriteTarget(readyInput({ chainId: 1 }));
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('CHAIN_UNSUPPORTED');
  });

  it('fails closed on wrong Optimism network (mainnet vs sepolia)', () => {
    const result = evaluateWriteTarget(
      readyInput({ chainId: 10, expectedChainId: 11155420 }),
    );
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('WRONG_CHAIN');
    expect(mapGateFailureToMachineReason(result.failures[0])).toBe('WRONG_NETWORK');
  });

  it('fails closed when the target address is missing', () => {
    const result = evaluateWriteTarget(readyInput({ targetAddress: null }));
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('MISSING_MANIFEST');
  });

  it('fails closed on zero address targets', () => {
    const result = evaluateWriteTarget(readyInput({ targetAddress: ZERO_ADDRESS }));
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('PLACEHOLDER_ADDRESS');
  });

  it('fails closed on placeholder address targets', () => {
    const result = evaluateWriteTarget(readyInput({ targetAddress: PLACEHOLDER }));
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('PLACEHOLDER_ADDRESS');
  });

  it('fails closed on invalid account addresses', () => {
    const result = evaluateWriteTarget(readyInput({ account: '0xdeadbeef' }));
    expect(result.ready).toBe(false);
    expect(result.failures.some((f) => f.code === 'PLACEHOLDER_ADDRESS')).toBe(true);
  });

  it('enforces canonical address match when requireCanonicalMatch is true', () => {
    const other = '0x1111111111111111111111111111111111111111';
    const result = evaluateWriteTarget(
      readyInput({ targetAddress: other, requireCanonicalMatch: true }),
    );
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('WRONG_ADDRESS');
  });

  it('allows non-canonical targets when requireCanonicalMatch is not set', () => {
    const other = '0x1111111111111111111111111111111111111111';
    const result = evaluateWriteTarget(readyInput({ targetAddress: other }));
    expect(result.ready).toBe(true);
  });

  it('fails closed when allowance is unknown', () => {
    const result = evaluateWriteTarget(
      readyInput({ allowance: { required: 1n, approved: null } }),
    );
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('ALLOWANCE_UNKNOWN');
  });

  it('fails closed when allowance is insufficient', () => {
    const result = evaluateWriteTarget(
      readyInput({ allowance: { required: 100n, approved: 50n } }),
    );
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('ALLOWANCE_INSUFFICIENT');
  });

  it('passes when allowance covers the requirement', () => {
    const result = evaluateWriteTarget(
      readyInput({ allowance: { required: 100n, approved: 100n } }),
    );
    expect(result.ready).toBe(true);
  });

  it('fails closed while simulation is pending', () => {
    const result = evaluateWriteTarget(
      readyInput({ simulation: { status: 'pending' } }),
    );
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('SIMULATION_REQUIRED');
  });

  it('fails closed when simulation fails', () => {
    const result = evaluateWriteTarget(
      readyInput({ simulation: { status: 'failed', error: 'revert' } }),
    );
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('SIMULATION_FAILED');
  });

  it('allows passed and not-required simulations', () => {
    expect(
      evaluateWriteTarget(readyInput({ simulation: { status: 'passed' } })).ready,
    ).toBe(true);
    expect(
      evaluateWriteTarget(readyInput({ simulation: { status: 'not-required' } }))
        .ready,
    ).toBe(true);
  });

  it('fails closed while a receipt is pending', () => {
    const result = evaluateWriteTarget(
      readyInput({ receipt: { status: 'pending' } }),
    );
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('RECEIPT_PENDING');
  });

  it('fails closed when a receipt reverted', () => {
    const result = evaluateWriteTarget(
      readyInput({ receipt: { status: 'reverted' } }),
    );
    expect(result.ready).toBe(false);
    expect(result.failures[0]?.code).toBe('RECEIPT_REVERTED');
    expect(result.reason).toMatch(/reverted/i);
  });

  it('allows a successful receipt status', () => {
    const result = evaluateWriteTarget(
      readyInput({ receipt: { status: 'success' } }),
    );
    expect(result.ready).toBe(true);
  });

  it('allows local dev chain 31337 only when allowLocalDev is true', () => {
    const blocked = evaluateWriteTarget(
      readyInput({ chainId: 31337, expectedChainId: 11155420 }),
    );
    expect(blocked.ready).toBe(false);

    const allowed = evaluateWriteTarget(
      readyInput({
        chainId: 31337,
        expectedChainId: 11155420,
        allowLocalDev: true,
      }),
    );
    expect(allowed.ready).toBe(true);
  });

  it('collects multiple blocking failures', () => {
    const result = evaluateWriteTarget({
      account: null,
      chainId: null,
      targetAddress: null,
    });
    expect(result.ready).toBe(false);
    expect(result.failures.length).toBeGreaterThanOrEqual(3);
    expect(result.failures.every((f) => f.blocking)).toBe(true);
  });
});

describe('assertWriteReady', () => {
  it('does not throw when ready', () => {
    expect(() => assertWriteReady(readyInput())).not.toThrow();
  });

  it('throws WriteGateError with failures when not ready', () => {
    try {
      assertWriteReady(readyInput({ account: null }));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WriteGateError);
      const gateErr = err as WriteGateError;
      expect(gateErr.failures[0]?.code).toBe('WALLET_DISCONNECTED');
      expect(gateErr.message).toContain('WALLET_DISCONNECTED');
    }
  });
});

describe('mapGateFailureToMachineReason', () => {
  it('maps chain failures to WRONG_NETWORK', () => {
    expect(
      mapGateFailureToMachineReason({
        code: 'WRONG_CHAIN',
        message: 'x',
        blocking: true,
      }),
    ).toBe('WRONG_NETWORK');
    expect(
      mapGateFailureToMachineReason({
        code: 'CHAIN_UNSUPPORTED',
        message: 'x',
        blocking: true,
      }),
    ).toBe('WRONG_NETWORK');
  });

  it('maps other failures to INVALID_TRANSITION', () => {
    expect(
      mapGateFailureToMachineReason({
        code: 'WALLET_DISCONNECTED',
        message: 'x',
        blocking: true,
      }),
    ).toBe('INVALID_TRANSITION');
  });
});

describe('artifact resolvers', () => {
  it('resolves canonical release address and chain from artifacts', () => {
    expect(resolveCanonicalTargetAddress()).toBe(VALID_TARGET);
    expect(resolveExpectedChainId()).toBe(11155420);
  });
});
