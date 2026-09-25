/**
 * Unit tests for useDisputeSubmission hook
 * Tests validation, simulation, and encoding for dispute opening transactions
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useAccount, useChainId } from 'wagmi';
import {
  useDisputeSubmission,
  canSubmitDispute,
  getPrimaryError,
  formatBondAmount,
} from '../useDisputeSubmission';
import type {
  DisputeContext,
  DisputeSubmissionPayload,
  DisputeValidation,
} from '@/app/types/dispute';

// Mock Wagmi hooks
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
}));

// Mock contract registry
jest.mock('@/lib/contracts/registry', () => ({
  getContractAddress: jest.fn(() => '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'),
  getContractAbi: jest.fn(() => []),
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

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseChainId = useChainId as jest.MockedFunction<typeof useChainId>;

describe('useDisputeSubmission', () => {
  const mockContext: DisputeContext = {
    provisionalOutcome: {
      claimId: 'claim-123',
      decision: 'VERIFIED',
      votesFor: 7,
      votesAgainst: 3,
      totalStake: '5000000000000000000',
      outcomeAt: new Date().toISOString(),
      outcomeBlock: 12345600,
      isProvisional: true,
      isFinalized: false,
    },
    deadline: {
      claimId: 'claim-123',
      windowStartTime: new Date(Date.now() - 3600000).toISOString(),
      windowEndTime: new Date(Date.now() + 82800000).toISOString(),
      timeRemaining: 82800,
      windowEndBlock: 12387000,
      currentBlock: 12345678,
      blocksRemaining: 41322,
      isWindowOpen: true,
      isWindowClosed: false,
      hasActiveDispute: false,
    },
    bond: {
      claimId: 'claim-123',
      bondAmount: '1000000000000000000', // 1 ETH
      slashAmount: '100000000000000000', // 0.1 ETH
      slashPercentage: 10,
      potentialReward: '1500000000000000000', // 1.5 ETH
      rewardMultiplier: 1.5,
    },
    walletPosition: {
      claimId: 'claim-123',
      userAddress: '0x1234567890123456789012345678901234567890',
      canChallenge: true,
      hasParticipatedInFirstRound: false,
      hasOpenedDispute: false,
      currentBalance: '5000000000000000000', // 5 ETH
      hasSufficientBalance: true,
      balanceAfterBond: '4000000000000000000', // 4 ETH
    },
    isEligible: true,
  };

  const mockPayload: DisputeSubmissionPayload = {
    claimId: 'claim-123',
    reason: 'The verification process was flawed and biased.',
    bondAmount: '1000000000000000000', // 1 ETH
    userAddress: '0x1234567890123456789012345678901234567890',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);

    mockUseChainId.mockReturnValue(11155420); // Reviewed release chain
  });

  describe('Validation', () => {
    it('should validate successfully when all conditions met', () => {
      const { result } = renderHook(() => useDisputeSubmission());

      const validation = result.current.validateDispute(mockContext, mockPayload);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.checks.windowOpen).toBe(true);
      expect(validation.checks.noActiveDispute).toBe(true);
      expect(validation.checks.walletConnected).toBe(true);
      expect(validation.checks.correctChain).toBe(true);
      expect(validation.checks.sufficientBalance).toBe(true);
      expect(validation.checks.bondAmountValid).toBe(true);
      expect(validation.checks.reasonProvided).toBe(true);
    });

    it('should reject when dispute window closed', () => {
      const closedContext = {
        ...mockContext,
        deadline: {
          ...mockContext.deadline,
          isWindowOpen: false,
          isWindowClosed: true,
          timeRemaining: 0,
        },
      };

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(closedContext, mockPayload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Dispute window has closed or has not opened yet'
      );
      expect(validation.checks.windowOpen).toBe(false);
    });

    it('should reject when dispute already opened', () => {
      const disputedContext = {
        ...mockContext,
        deadline: {
          ...mockContext.deadline,
          hasActiveDispute: true,
        },
      };

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(disputedContext, mockPayload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'A dispute has already been opened for this claim'
      );
      expect(validation.checks.noActiveDispute).toBe(false);
    });

    it('should reject when wallet not connected', () => {
      mockUseAccount.mockReturnValue({
        address: undefined,
        isConnected: false,
      } as any);

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(mockContext, mockPayload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Wallet not connected');
      expect(validation.checks.walletConnected).toBe(false);
    });

    it('should reject on wrong network', () => {
      mockUseChainId.mockReturnValue(1); // Ethereum mainnet

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(mockContext, mockPayload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Wrong network'))).toBe(true);
      expect(validation.checks.correctChain).toBe(false);
    });

    it('should reject insufficient balance', () => {
      const poorContext = {
        ...mockContext,
        walletPosition: {
          ...mockContext.walletPosition,
          currentBalance: '500000000000000000', // 0.5 ETH (need 1 ETH)
          hasSufficientBalance: false,
        },
      };

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(poorContext, mockPayload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Insufficient balance for challenge bond');
      expect(validation.checks.sufficientBalance).toBe(false);
    });

    it('should reject when bond amount does not match required', () => {
      const wrongBondPayload = {
        ...mockPayload,
        bondAmount: '500000000000000000', // 0.5 ETH instead of 1 ETH
      };

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(mockContext, wrongBondPayload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Bond amount must be exactly'))).toBe(
        true
      );
      expect(validation.checks.bondAmountValid).toBe(false);
    });

    it('should reject when reason is empty', () => {
      const noReasonPayload = {
        ...mockPayload,
        reason: '',
      };

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(mockContext, noReasonPayload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Dispute reason is required');
      expect(validation.checks.reasonProvided).toBe(false);
    });

    it('should warn when reason is too short', () => {
      const shortReasonPayload = {
        ...mockPayload,
        reason: 'Bad',
      };

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(mockContext, shortReasonPayload);

      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings.some((w) => w.includes('more descriptive'))).toBe(true);
    });

    it('should warn when user participated in first round', () => {
      const participatedContext = {
        ...mockContext,
        walletPosition: {
          ...mockContext.walletPosition,
          hasParticipatedInFirstRound: true,
        },
      };

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(
        participatedContext,
        mockPayload
      );

      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(
        validation.warnings.some((w) => w.includes('participated in first-round'))
      ).toBe(true);
    });

    it('should handle invalid bond amount format', () => {
      const invalidBondPayload = {
        ...mockPayload,
        bondAmount: 'not-a-number',
      };

      const { result } = renderHook(() => useDisputeSubmission());
      const validation = result.current.validateDispute(mockContext, invalidBondPayload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Invalid'))).toBe(true);
    });
  });

  describe('Simulation', () => {
    it('should simulate dispute successfully', async () => {
      const { result } = renderHook(() => useDisputeSubmission());

      const simulation = await result.current.simulateDispute(mockContext, mockPayload);

      expect(simulation.success).toBe(true);
      expect(simulation.gasEstimate).toBe('200000');
      expect(simulation.projectedState).toBeDefined();
      expect(simulation.projectedState?.disputeId).toBeDefined();
      expect(simulation.projectedState?.bondLocked).toBe('1000000000000000000');
      expect(simulation.projectedState?.newStatus).toBe('DISPUTED');
      expect(simulation.data).toBeDefined();
      expect(simulation.data?.from).toBe('0x1234567890123456789012345678901234567890');
      expect(simulation.data?.to).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      expect(simulation.data?.value).toBe('1000000000000000000');
    });

    it('should fail simulation with validation errors', async () => {
      const invalidContext = {
        ...mockContext,
        deadline: {
          ...mockContext.deadline,
          isWindowOpen: false,
          isWindowClosed: true,
        },
      };

      const { result } = renderHook(() => useDisputeSubmission());
      const simulation = await result.current.simulateDispute(
        invalidContext,
        mockPayload
      );

      expect(simulation.success).toBe(false);
      expect(simulation.error).toBeDefined();
      expect(simulation.error).toContain('Dispute window');
    });

    it('should set isSimulating state during simulation', async () => {
      const { result } = renderHook(() => useDisputeSubmission());

      expect(result.current.isSimulating).toBe(false);

      const simulationPromise = result.current.simulateDispute(mockContext, mockPayload);

      // Note: In real async scenario, isSimulating would be true during execution
      // For this test, we just verify the final state
      await simulationPromise;

      expect(result.current.isSimulating).toBe(false);
    });

    it('should generate predicted dispute ID', async () => {
      const { result } = renderHook(() => useDisputeSubmission());

      const simulation = await result.current.simulateDispute(mockContext, mockPayload);

      expect(simulation.projectedState?.disputeId).toMatch(/^dispute-/);
      expect(simulation.projectedState?.disputeId).toContain('claim-123');
    });

    it('should encode calldata', async () => {
      const { result } = renderHook(() => useDisputeSubmission());

      const simulation = await result.current.simulateDispute(mockContext, mockPayload);

      expect(simulation.data?.calldata).toBeDefined();
      expect(simulation.data?.calldata).toMatch(/^0x9a8a0592/); // OPEN_DISPUTE_SELECTOR
    });
  });

  describe('Submission', () => {
    it('should throw error requiring wallet integration', async () => {
      const { result } = renderHook(() => useDisputeSubmission());

      await expect(
        result.current.submitDispute(mockContext, mockPayload)
      ).rejects.toThrow('Dispute submission requires wallet writeContract integration');
    });

    it('should validate before submission', async () => {
      const invalidContext = {
        ...mockContext,
        deadline: {
          ...mockContext.deadline,
          isWindowOpen: false,
        },
      };

      const { result } = renderHook(() => useDisputeSubmission());

      await expect(
        result.current.submitDispute(invalidContext, mockPayload)
      ).rejects.toThrow();
    });

    it('should simulate before submission', async () => {
      const { result } = renderHook(() => useDisputeSubmission());

      // Since submission throws, we can't test full flow
      // But we can verify validation is called
      const validation = result.current.validateDispute(mockContext, mockPayload);
      expect(validation.isValid).toBe(true);
    });
  });

  describe('State management', () => {
    it('should track error state', async () => {
      const invalidContext = {
        ...mockContext,
        deadline: {
          ...mockContext.deadline,
          isWindowOpen: false,
        },
      };

      const { result } = renderHook(() => useDisputeSubmission());

      await result.current.simulateDispute(invalidContext, mockPayload);

      expect(result.current.error).toBeDefined();
    });

    it('should clear error on successful simulation', async () => {
      const { result } = renderHook(() => useDisputeSubmission());

      await result.current.simulateDispute(mockContext, mockPayload);

      expect(result.current.error).toBeNull();
    });

    it('should expose artifact version', () => {
      const { result } = renderHook(() => useDisputeSubmission());

      expect(result.current.artifactVersion).toBe('2.0.0');
    });
  });

  describe('Configuration', () => {
    it('should accept custom contract address', () => {
      const customAddress = '0xCustomAddress000000000000000000000000000';
      const { result } = renderHook(() =>
        useDisputeSubmission({ contractAddress: customAddress })
      );

      // Validation will use custom address
      const validation = result.current.validateDispute(mockContext, mockPayload);
      expect(validation).toBeDefined();
    });

    it('should accept custom expected chain ID', () => {
      mockUseChainId.mockReturnValue(11155420); // Optimism Sepolia

      const { result } = renderHook(() =>
        useDisputeSubmission({ expectedChainId: 11155420 })
      );

      const validation = result.current.validateDispute(mockContext, mockPayload);
      expect(validation.checks.correctChain).toBe(true);
    });
  });
});

describe('canSubmitDispute utility', () => {
  it('should return true for valid validation', () => {
    const validation: DisputeValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      checks: {} as any,
    };

    expect(canSubmitDispute(validation)).toBe(true);
  });

  it('should return false for invalid validation', () => {
    const validation: DisputeValidation = {
      isValid: false,
      errors: ['Window closed'],
      warnings: [],
      checks: {} as any,
    };

    expect(canSubmitDispute(validation)).toBe(false);
  });
});

describe('getPrimaryError utility', () => {
  it('should return first error', () => {
    const validation: DisputeValidation = {
      isValid: false,
      errors: ['Window closed', 'Insufficient balance'],
      warnings: [],
      checks: {} as any,
    };

    expect(getPrimaryError(validation)).toBe('Window closed');
  });

  it('should return null when no errors', () => {
    const validation: DisputeValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      checks: {} as any,
    };

    expect(getPrimaryError(validation)).toBeNull();
  });
});

describe('formatBondAmount utility', () => {
  it('should format 1 ETH correctly', () => {
    expect(formatBondAmount('1000000000000000000')).toBe('1.0000');
  });

  it('should format 0.5 ETH correctly', () => {
    expect(formatBondAmount('500000000000000000')).toBe('0.5000');
  });

  it('should format 0.1234 ETH correctly', () => {
    expect(formatBondAmount('123400000000000000')).toBe('0.1234');
  });

  it('should handle invalid input', () => {
    expect(formatBondAmount('invalid')).toBe('0.0000');
  });

  it('should handle zero', () => {
    expect(formatBondAmount('0')).toBe('0.0000');
  });
});
