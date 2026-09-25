import { renderHook } from '@testing-library/react';
import { useWriteReadiness } from '@/hooks/useWriteReadiness';
import * as wagmi from 'wagmi';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
}));

const VALID_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const VALID_TARGET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('useWriteReadiness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (wagmi.useAccount as jest.Mock).mockReturnValue({ address: VALID_ACCOUNT });
    (wagmi.useChainId as jest.Mock).mockReturnValue(11155420);
  });

  it('reports ready for a connected wallet on the release chain', () => {
    const { result } = renderHook(() =>
      useWriteReadiness({
        targetAddress: VALID_TARGET,
        requireCanonicalMatch: true,
      }),
    );

    expect(result.current.isReady).toBe(true);
    expect(result.current.primaryCode).toBeNull();
    expect(result.current.message).toBeNull();
    expect(result.current.account).toBe(VALID_ACCOUNT);
    expect(result.current.expectedChainId).toBe(11155420);
  });

  it('fails closed when disconnected', () => {
    (wagmi.useAccount as jest.Mock).mockReturnValue({ address: undefined });

    const { result } = renderHook(() =>
      useWriteReadiness({ targetAddress: VALID_TARGET }),
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.primaryCode).toBe('WALLET_DISCONNECTED');
    expect(result.current.message).toMatch(/connect a wallet/i);
    expect(result.current.codes).toContain('WALLET_DISCONNECTED');
  });

  it('fails closed on wrong chain', () => {
    (wagmi.useChainId as jest.Mock).mockReturnValue(10);

    const { result } = renderHook(() =>
      useWriteReadiness({
        targetAddress: VALID_TARGET,
        expectedChainId: 11155420,
      }),
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.primaryCode).toBe('WRONG_CHAIN');
    expect(result.current.message).toMatch(/wrong network/i);
  });

  it('uses account and chain overrides when provided', () => {
    (wagmi.useAccount as jest.Mock).mockReturnValue({ address: undefined });
    (wagmi.useChainId as jest.Mock).mockReturnValue(1);

    const { result } = renderHook(() =>
      useWriteReadiness({
        accountOverride: VALID_ACCOUNT,
        chainIdOverride: 11155420,
        targetAddress: VALID_TARGET,
        expectedChainId: 11155420,
      }),
    );

    expect(result.current.isReady).toBe(true);
    expect(result.current.account).toBe(VALID_ACCOUNT);
    expect(result.current.chainId).toBe(11155420);
  });

  it('returns ready when disabled (read-only views)', () => {
    (wagmi.useAccount as jest.Mock).mockReturnValue({ address: undefined });
    (wagmi.useChainId as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useWriteReadiness({ enabled: false }));

    expect(result.current.isReady).toBe(true);
    expect(result.current.codes).toHaveLength(0);
  });

  it('surfaces allowance failures for token spend actions', () => {
    const { result } = renderHook(() =>
      useWriteReadiness({
        targetAddress: VALID_TARGET,
        allowance: { required: 10n, approved: 1n },
      }),
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.primaryCode).toBe('ALLOWANCE_INSUFFICIENT');
  });

  it('surfaces simulation failures before signing', () => {
    const { result } = renderHook(() =>
      useWriteReadiness({
        targetAddress: VALID_TARGET,
        simulation: { status: 'failed', error: 'execution reverted' },
      }),
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.primaryCode).toBe('SIMULATION_FAILED');
    expect(result.current.message).toMatch(/execution reverted/i);
  });

  it('surfaces reverted receipt state and never reports ready', () => {
    const { result } = renderHook(() =>
      useWriteReadiness({
        targetAddress: VALID_TARGET,
        receipt: { status: 'reverted' },
      }),
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.primaryCode).toBe('RECEIPT_REVERTED');
  });

  it('enforces canonical match when requested', () => {
    const other = '0x1111111111111111111111111111111111111111';
    const { result } = renderHook(() =>
      useWriteReadiness({
        targetAddress: other,
        requireCanonicalMatch: true,
      }),
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.primaryCode).toBe('WRONG_ADDRESS');
  });
});
