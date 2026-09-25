import { renderHook, act } from '@testing-library/react';
import { useReceiptProjection } from '../useReceiptProjection';

describe('useReceiptProjection', () => {
  it('keeps a confirmed receipt aligned with its projected API entity', () => {
    const { result } = renderHook(() =>
      useReceiptProjection({
        txHash: '0xabc',
        chainId: 10,
        contractAddress: '0x123',
        claimId: 'claim-1',
        receipt: {
          transactionHash: '0xabc',
          status: '0x1',
          blockNumber: 123n,
          logs: [{ topic0: '0xevent' }],
          from: '0xaaa',
          to: '0x123',
          chainId: 10,
        },
        projection: {
          txHash: '0xabc',
          status: 'confirmed',
          chainId: 10,
          claimId: 'claim-1',
          contractAddress: '0x123',
        },
        artifactVersion: 'v2.1.0',
      }),
    );

    expect(result.current.status).toBe('confirmed');
    expect(result.current.isMismatch).toBe(false);
    expect(result.current.isProtocolDisabled).toBe(false);
  });

  it('marks a reverted receipt as rejected and blocks projection acceptance', () => {
    const { result } = renderHook(() =>
      useReceiptProjection({
        txHash: '0xdef',
        chainId: 10,
        contractAddress: '0x123',
        claimId: 'claim-2',
        receipt: {
          transactionHash: '0xdef',
          status: '0x0',
          blockNumber: 124n,
          logs: [],
          from: '0xaaa',
          to: '0x123',
          chainId: 10,
        },
        projection: {
          txHash: '0xdef',
          status: 'reverted',
          chainId: 10,
          claimId: 'claim-2',
          contractAddress: '0x123',
        },
        artifactVersion: 'v2.1.0',
      }),
    );

    expect(result.current.status).toBe('rejected');
    expect(result.current.isProtocolDisabled).toBe(true);
  });

  it('flags a stale projection missing receipt confirmation', () => {
    const { result } = renderHook(() =>
      useReceiptProjection({
        txHash: '0xghi',
        chainId: 10,
        contractAddress: '0x123',
        claimId: 'claim-3',
        receipt: undefined,
        projection: {
          txHash: '0xghi',
          status: 'indexed',
          chainId: 10,
          claimId: 'claim-3',
          contractAddress: '0x123',
        },
        artifactVersion: 'v2.1.0',
      }),
    );

    expect(result.current.status).toBe('stale');
    expect(result.current.isMismatch).toBe(true);
  });

  it('flags a partial projection as degraded when the API cannot prove integrity', () => {
    const { result } = renderHook(() =>
      useReceiptProjection({
        txHash: '0xmno',
        chainId: 10,
        contractAddress: '0x123',
        claimId: 'claim-degraded',
        receipt: {
          transactionHash: '0xmno',
          status: '0x1',
          blockNumber: 126n,
          logs: [{ topic0: '0xevent' }],
          from: '0xaaa',
          to: '0x123',
          chainId: 10,
        },
        projection: {
          status: undefined,
          chainId: 10,
          claimId: 'claim-degraded',
          contractAddress: '0x123',
        },
        artifactVersion: 'v2.1.0',
      }),
    );

    expect(result.current.status).toBe('degraded');
    expect(result.current.isMismatch).toBe(false);
  });

  it('detects wrong-network and version mismatches before accepting the projection', () => {
    const { result } = renderHook(() =>
      useReceiptProjection({
        txHash: '0xjkl',
        chainId: 1,
        contractAddress: '0x123',
        claimId: 'claim-4',
        receipt: {
          transactionHash: '0xjkl',
          status: '0x1',
          blockNumber: 125n,
          logs: [{ topic0: '0xevent' }],
          from: '0xaaa',
          to: '0x123',
          chainId: 1,
        },
        projection: {
          txHash: '0xjkl',
          status: 'confirmed',
          chainId: 10,
          claimId: 'claim-4',
          contractAddress: '0x456',
        },
        artifactVersion: 'v2.2.0',
      }),
    );

    expect(result.current.status).toBe('mismatch');
    expect(result.current.isMismatch).toBe(true);
    expect(result.current.isWrongNetwork).toBe(true);
    expect(result.current.isProtocolDisabled).toBe(true);
  });

  it('supports a no-op state when no tx or projection is present', () => {
    const { result } = renderHook(() =>
      useReceiptProjection({
        txHash: undefined,
        chainId: 10,
        contractAddress: '0x123',
        claimId: 'claim-5',
        receipt: undefined,
        projection: undefined,
        artifactVersion: 'v2.1.0',
      }),
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.isProtocolDisabled).toBe(false);
  });
});
