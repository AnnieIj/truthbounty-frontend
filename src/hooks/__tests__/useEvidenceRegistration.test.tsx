import { renderHook, act } from '@testing-library/react';
import { useEvidenceRegistration } from '../useEvidenceRegistration';
import { useAccount, useChainId } from 'wagmi';
import { getContractAddress } from '@/lib/contracts/registry';

// Mock dependencies
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
}));

jest.mock('@/lib/contracts/registry', () => ({
  getContractAddress: jest.fn(),
  getProtocolVersion: jest.fn(() => 'v2.1.0'),
}));

const mockUseAccount = useAccount as jest.Mock;
const mockUseChainId = useChainId as jest.Mock;
const mockGetContractAddress = getContractAddress as jest.Mock;

describe('useEvidenceRegistration', () => {
  const validClaimId = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetContractAddress.mockReturnValue('0x1234567890123456789012345678901234567890');
  });

  describe('Validation', () => {
    it('returns valid for correct payload on correct network', () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(10); // OPTIMISM_MAINNET_CHAIN_ID

      const { result } = renderHook(() => useEvidenceRegistration());

      const validation = result.current.validateEvidence({
        claimId: validClaimId,
        evidenceUri: 'ipfs://QmXxxx',
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('returns error if wallet is not connected', () => {
      mockUseAccount.mockReturnValue({ address: undefined, isConnected: false });
      mockUseChainId.mockReturnValue(10);

      const { result } = renderHook(() => useEvidenceRegistration());

      const validation = result.current.validateEvidence({
        claimId: validClaimId,
        evidenceUri: 'ipfs://QmXxxx',
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Wallet not connected');
    });

    it('returns error if wrong network', () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(1); // Wrong network

      const { result } = renderHook(() => useEvidenceRegistration());

      const validation = result.current.validateEvidence({
        claimId: validClaimId,
        evidenceUri: 'ipfs://QmXxxx',
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Wrong network. Expected chain 10, got 1');
    });

    it('returns error for invalid claim ID format', () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(10);

      const { result } = renderHook(() => useEvidenceRegistration());

      const validation = result.current.validateEvidence({
        claimId: 'invalid-id',
        evidenceUri: 'ipfs://QmXxxx',
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid claim mismatch: claimId must be a 32-byte hex string (without 0x)');
    });

    it('returns error for unsupported scheme', () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(10);

      const { result } = renderHook(() => useEvidenceRegistration());

      const validation = result.current.validateEvidence({
        claimId: validClaimId,
        evidenceUri: 'ftp://unsupported.com',
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Oversized input: evidence URI must be at most 1024 characters');

    it('returns error for oversized input', () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(10);

      const { result } = renderHook(() => useEvidenceRegistration());

      const longUri = 'https://' + 'a'.repeat(1024) + '.com';
      const validation = result.current.validateEvidence({
        claimId: validClaimId,
        evidenceUri: longUri,
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Oversized input: evidence URI must be under 1024 characters');
    });

    it('prevents raw secrets in URI', () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(10);

      const { result } = renderHook(() => useEvidenceRegistration());

      const validation = result.current.validateEvidence({
        claimId: validClaimId,
        evidenceUri: 'https://example.com/evidence?secret=12345',
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Raw secrets detected in URI. Please remove sensitive information.');
    });
  });

  describe('Submission', () => {
    it('throws error about needing wallet writeContract integration when submission is attempted', async () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(10);

      const { result } = renderHook(() => useEvidenceRegistration());

      await expect(
        result.current.submitEvidence({
          claimId: validClaimId,
          evidenceUri: 'ipfs://QmXxxx',
        })
      ).rejects.toThrow('Evidence registration requires wallet writeContract integration; no synthetic transaction hash is emitted.');
    });
  });
});
