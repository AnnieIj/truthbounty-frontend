import {
  reconcileVerificationState,
  ReconcileVerificationInput,
  submitVerificationProjection,
} from '@/app/lib/verification-reconcile';

const TX_HASH = '0x' + 'ab'.repeat(32);
const CHAIN = 11155420;
const CLAIM = '123';
const VERIFY_POSITION = 'TRUE' as const;

const confirmedProjection = {
  id: 'ver-1',
  claimId: CLAIM,
  decision: 'VERIFY',
  status: 'confirmed',
  txHash: TX_HASH,
  chainId: CHAIN,
  artifactVersion: 'iv-verification-submission@v1.0.0',
};

const baseInput: ReconcileVerificationInput = {
  chainId: CHAIN,
  artifactVersion: 'iv-verification-submission@v1.0.0',
  claimId: CLAIM,
  receipt: { transactionHash: TX_HASH, status: '0x1', chainId: CHAIN },
  projection: confirmedProjection,
  onChain: {
    claimId: CLAIM,
    verifier: '0x0000000000000000000000000000000000000001',
    exists: true,
    position: VERIFY_POSITION,
    stake: 2n * 10n ** 18n,
  },
  expectedPosition: VERIFY_POSITION,
};

describe('reconcileVerificationState', () => {
  it('returns idle when nothing is present', () => {
    const result = reconcileVerificationState({});
    expect(result.status).toBe('idle');
    expect(result.isMismatch).toBe(false);
  });

  it('confirms when receipt, projection and on-chain state agree', () => {
    const result = reconcileVerificationState(baseInput);
    expect(result.status).toBe('confirmed');
    expect(result.isMismatch).toBe(false);
    expect(result.isWrongNetwork).toBe(false);
    expect(result.isProtocolDisabled).toBe(false);
  });

  it('flags a receipt on the wrong chain', () => {
    const result = reconcileVerificationState({
      ...baseInput,
      receipt: { transactionHash: TX_HASH, status: '0x1', chainId: 1 },
    });
    expect(result.status).toBe('mismatch');
    expect(result.isWrongNetwork).toBe(true);
    expect(result.details.join(' ')).toContain('different chain');
  });

  it('flags a projection for the wrong claim', () => {
    const result = reconcileVerificationState({
      ...baseInput,
      projection: { ...confirmedProjection, claimId: '999' },
    });
    expect(result.status).toBe('mismatch');
    expect(result.isMismatch).toBe(true);
  });

  it('flags an on-chain position that contradicts the expected position', () => {
    const result = reconcileVerificationState({
      ...baseInput,
      onChain: {
        claimId: CLAIM,
        verifier: '0x0000000000000000000000000000000000000001',
        exists: true,
        position: 'FALSE',
        stake: 2n * 10n ** 18n,
      },
    });
    expect(result.status).toBe('mismatch');
    expect(result.details.join(' ')).toContain('contradicts expected');
  });

  it('flags a projection decision that contradicts on-chain state', () => {
    const result = reconcileVerificationState({
      ...baseInput,
      projection: { ...confirmedProjection, decision: 'REJECT' },
    });
    expect(result.status).toBe('mismatch');
    expect(result.details.join(' ')).toContain('projection decision');
  });

  it('reports a rejected receipt', () => {
    const result = reconcileVerificationState({
      ...baseInput,
      receipt: { transactionHash: TX_HASH, status: '0x0', chainId: CHAIN },
    });
    expect(result.status).toBe('rejected');
    expect(result.isProtocolDisabled).toBe(true);
  });

  it('flags a stale projection when no on-chain position is visible', () => {
    const result = reconcileVerificationState({
      ...baseInput,
      onChain: null,
      receipt: undefined,
    });
    expect(result.status).toBe('stale');
    expect(result.isMismatch).toBe(true);
  });

  it('reports stale when the projection has not confirmed', () => {
    const result = reconcileVerificationState({
      ...baseInput,
      projection: { ...confirmedProjection, status: 'PENDING' },
    });
    expect(result.status).toBe('stale');
    expect(result.details.join(' ')).toContain('has not confirmed');
  });

  it('reports degraded when the API projection is missing required integrity fields', () => {
    const result = reconcileVerificationState({
      ...baseInput,
      projection: {
        ...confirmedProjection,
        status: undefined,
        txHash: undefined,
      },
    });
    expect(result.status).toBe('degraded');
    expect(result.details.join(' ')).toContain('incomplete');
  });

  it('flags a version mismatch with the pinned artifact', () => {
    const result = reconcileVerificationState({
      ...baseInput,
      projection: { ...confirmedProjection, artifactVersion: 'OLD' },
    });
    expect(result.status).toBe('mismatch');
    expect(result.details.join(' ')).toContain('artifact version mismatch');
  });
});

describe('submitVerificationProjection', () => {
  const fetchMock = global.fetch as jest.Mock;

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('posts the projection body as whole token units', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'ver-1' }),
    });

    const created = await submitVerificationProjection({
      claimId: CLAIM,
      verifierAddress: '0x0000000000000000000000000000000000000001',
      decision: 'VERIFY',
      stakeAmount: 2,
      transactionHash: TX_HASH,
      chainId: CHAIN,
      artifactVersion: 'iv-verification-submission@v1.0.0',
      submittedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(created).toEqual({ id: 'ver-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/verifications');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.stakeAmount).toBe(2);
    expect(body.decision).toBe('VERIFY');
    expect(body.claimId).toBe(CLAIM);
  });

  it('throws RECONCILE_FAILED when the API rejects', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      submitVerificationProjection({
        claimId: CLAIM,
        verifierAddress: '0x0000000000000000000000000000000000000001',
        decision: 'REJECT',
        stakeAmount: 1,
        transactionHash: TX_HASH,
        chainId: CHAIN,
        artifactVersion: 'iv-verification-submission@v1.0.0',
        submittedAt: '2026-01-01T00:00:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'RECONCILE_FAILED' });
  });
});
