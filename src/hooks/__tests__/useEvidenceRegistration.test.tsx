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
  getProtocolVersion: jest.fn(() => '2.0.0'),
  getReleaseChainId: jest.fn(() => 11155420),
  getProtocolRelease: jest.fn(() => ({
    manifest: {
      protocolVersion: '2.0.0',
      releaseId: 'v2.0.0-sepolia',
      gitCommit: '5333c0acb9ccfb8a6a37ae76b3397d06781f0119',
      compilerVersion: 'foundry-0.2.0',
      chainId: 11155420,
      deploymentBlock: 0,
      abiVersion: '2.0.0',
      eventSchemaVersion: '2.0.0',
      parameterSetVersion: '2.0.0',
      contracts: {
        TruthBountyWeighted: {
          proxy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          implementation: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        },
      },
    },
    addresses: {
      chainId: 11155420,
      TruthBountyWeighted: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    },
    abis: { TruthBountyWeighted: [] },
    events: { version: '2.0.0', events: [] },
    parameters: {},
    roles: {},
    checksums: { version: '1', files: {} },
  })),
}));

const mockUseAccount = useAccount as jest.Mock;
const mockUseChainId = useChainId as jest.Mock;
const mockGetContractAddress = getContractAddress as jest.Mock;

describe('useEvidenceRegistration', () => {
  const validClaimId = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetContractAddress.mockReturnValue('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  });

  describe('Validation', () => {
    it('returns valid for correct payload on correct network', () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(11155420); // Reviewed release chain

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
      mockUseChainId.mockReturnValue(11155420);

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
      expect(validation.errors.some((e) => e.includes('Wrong network'))).toBe(true);
    });

    it('returns error for invalid claim ID format', () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(11155420);

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
      mockUseChainId.mockReturnValue(11155420);

      const { result } = renderHook(() => useEvidenceRegistration());

      const validation = result.current.validateEvidence({
        claimId: validClaimId,
        evidenceUri: 'ftp://unsupported.com',
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Unsupported scheme: only https and ipfs are allowed');
    });

    it('returns error for oversized input', () => {
      mockUseAccount.mockReturnValue({ address: '0x111', isConnected: true });
      mockUseChainId.mockReturnValue(11155420);

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
      mockUseChainId.mockReturnValue(11155420);

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
      mockUseChainId.mockReturnValue(11155420);

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
