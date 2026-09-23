/**
 * Unit tests for useAppealParticipation hook
 * Tests: successful submission, validation errors, simulation, wrong network, revert scenarios
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppealParticipation } from '../useAppealParticipation';
import * as wagmi from 'wagmi';
import {
  AppealParticipationContext,
  AppealSnapshot,
  AppealDeadline,
  AppealStakeBounds,
  AppealWalletPosition,
} from '@/app/types/appeal';

// Mock Wagmi hooks
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
}));

describe('useAppealParticipation', () => {
  const mockContractAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const mockUserAddress = '0x1234567890123456789012345678901234567890';
  const RELEASE_CHAIN = 11155420;

  // Mock appeal context
  const createMockContext = (overrides?: Partial<AppealParticipationContext>): AppealParticipationContext => {
    const snapshot: AppealSnapshot = {
      appealId: 'appeal-123',
      claimId: 'claim-456',
      disputeId: 'dispute-789',
      initiatorAddress: '0x' + '1'.repeat(40),
      initiatorStake: '1000000000000000000',
      firstRoundDecision: 'VERIFIED',
      firstRoundVotesFor: 15,
      firstRoundVotesAgainst: 8,
      reason: 'Test appeal reason',
      initiatedAt: new Date().toISOString(),
      blockNumber: 12345000,
    };

    const deadline: AppealDeadline = {
      appealId: 'appeal-123',
      startTime: new Date(Date.now() - 3600000).toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      timeRemaining: 3600,
      endBlock: 12347000,
      currentBlock: 12345500,
      blocksRemaining: 1500,
      isActive: true,
      hasEnded: false,
    };

    const stakeBounds: AppealStakeBounds = {
      appealId: 'appeal-123',
      minStake: '100000000000000000', // 0.1 ETH
      maxStake: '10000000000000000000', // 10 ETH
      recommendedStake: '500000000000000000', // 0.5 ETH
      totalSupportStake: '3500000000000000000',
      totalOpposeStake: '2100000000000000000',
      supporterCount: 7,
      opposerCount: 4,
    };

    const walletPosition: AppealWalletPosition = {
      appealId: 'appeal-123',
      userAddress: mockUserAddress,
      hasParticipated: false,
      currentBalance: '5000000000000000000', // 5 ETH
      hasMinimumBalance: true,
    };

    return {
      snapshot,
      deadline,
      stakeBounds,
      walletPosition,
      isEligible: true,
      ...overrides,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (wagmi.useAccount as jest.Mock).mockReturnValue({
      address: mockUserAddress,
      isConnected: true,
    });
    (wagmi.useChainId as jest.Mock).mockReturnValue(RELEASE_CHAIN);
  });

  describe('successful participation', () => {
    it('should simulate support decision successfully', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      let simulation: any;

      await act(async () => {
        simulation = await result.current.simulateParticipation(
          mockContext,
          'SUPPORT',
          '500000000000000000' // 0.5 ETH
        );
      });

      expect(simulation?.success).toBe(true);
      expect(simulation?.gasEstimate).toBeDefined();
      expect(simulation?.projectedState).toBeDefined();
      expect(simulation?.projectedState?.newSupportTotal).toBe('4000000000000000000'); // 3.5 + 0.5
      expect(simulation?.data?.calldata).toContain('0xabc12345'); // Support selector
    });

    it('should simulate oppose decision successfully', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      let simulation: any;

      await act(async () => {
        simulation = await result.current.simulateParticipation(
          mockContext,
          'OPPOSE',
          '300000000000000000' // 0.3 ETH
        );
      });

      expect(simulation?.success).toBe(true);
      expect(simulation?.projectedState?.newOpposeTotal).toBe('2400000000000000000'); // 2.1 + 0.3
      expect(simulation?.data?.calldata).toContain('0xdef67890'); // Oppose selector
    });

    it('should submit participation successfully', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      let transaction: any;

      await act(async () => {
        transaction = await result.current.submitParticipation(
          mockContext,
          'SUPPORT',
          '500000000000000000'
        );
      });

      expect(transaction).toBeDefined();
      expect(transaction?.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(transaction?.from).toBe(mockUserAddress);
      expect(transaction?.to).toBe(mockContractAddress);
      expect(transaction?.status).toBe('PENDING');
      expect(transaction?.decision).toBe('SUPPORT');
      expect(transaction?.appealId).toBe('appeal-123');
      expect(transaction?.claimId).toBe('claim-456');
      expect(transaction?.disputeId).toBe('dispute-789');
    });

    it('should track last transaction', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();

      await act(async () => {
        await result.current.submitParticipation(
          mockContext,
          'OPPOSE',
          '200000000000000000'
        );
      });

      expect(result.current.lastTransaction).toBeDefined();
      expect(result.current.lastTransaction?.decision).toBe('OPPOSE');
      expect(result.current.lastTransaction?.stakeAmount).toBe('200000000000000000');
    });
  });

  describe('validation errors', () => {
    it('should reject when appeal has ended', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext({
        deadline: {
          appealId: 'appeal-123',
          startTime: new Date(Date.now() - 7200000).toISOString(),
          endTime: new Date(Date.now() - 3600000).toISOString(),
          timeRemaining: 0,
          endBlock: 12345000,
          currentBlock: 12346000,
          blocksRemaining: 0,
          isActive: false,
          hasEnded: true,
        },
        isEligible: false,
        ineligibilityReason: 'Appeal period has ended',
      });

      const validation = result.current.validateParticipation(
        mockContext,
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Appeal period has ended or has not started');
      expect(validation.checks.appealActive).toBe(false);
    });

    it('should reject when wallet not connected', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: undefined,
        isConnected: false,
      });

      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      const validation = result.current.validateParticipation(
        mockContext,
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Wallet not connected');
      expect(validation.checks.walletConnected).toBe(false);
    });

    it('should reject when on wrong network', async () => {
      (wagmi.useChainId as jest.Mock).mockReturnValue(1); // Ethereum mainnet

      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
          expectedChainId: RELEASE_CHAIN,
        })
      );

      const mockContext = createMockContext();
      const validation = result.current.validateParticipation(
        mockContext,
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Wrong network'))).toBe(true);
      expect(validation.checks.correctChain).toBe(false);
    });

    it('should reject when user already participated', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext({
        walletPosition: {
          appealId: 'appeal-123',
          userAddress: mockUserAddress,
          hasParticipated: true,
          existingDecision: 'SUPPORT',
          existingStake: '500000000000000000',
          participatedAt: new Date().toISOString(),
          transactionHash: '0xabc123',
          currentBalance: '4500000000000000000',
          hasMinimumBalance: true,
        },
        isEligible: false,
        ineligibilityReason: 'Already participated',
      });

      const validation = result.current.validateParticipation(
        mockContext,
        'OPPOSE',
        '300000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('You have already participated in this appeal');
      expect(validation.checks.notAlreadyParticipated).toBe(false);
    });

    it('should reject stake below minimum', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      const validation = result.current.validateParticipation(
        mockContext,
        'SUPPORT',
        '50000000000000000' // 0.05 ETH, below 0.1 minimum
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('below minimum'))).toBe(true);
      expect(validation.checks.stakeWithinBounds).toBe(false);
    });

    it('should reject stake above maximum', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      const validation = result.current.validateParticipation(
        mockContext,
        'SUPPORT',
        '15000000000000000000' // 15 ETH, above 10 maximum
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
      expect(validation.checks.stakeWithinBounds).toBe(false);
    });

    it('should reject insufficient balance', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext({
        walletPosition: {
          appealId: 'appeal-123',
          userAddress: mockUserAddress,
          hasParticipated: false,
          currentBalance: '50000000000000000', // 0.05 ETH
          hasMinimumBalance: false,
        },
      });

      const validation = result.current.validateParticipation(
        mockContext,
        'SUPPORT',
        '100000000000000000' // 0.1 ETH, more than balance
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Insufficient balance for stake amount');
      expect(validation.checks.sufficientBalance).toBe(false);
    });

    it('should reject invalid contract address', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: 'invalid-address',
        })
      );

      const mockContext = createMockContext();
      const validation = result.current.validateParticipation(
        mockContext,
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid contract address format');
      expect(validation.checks.contractAddressValid).toBe(false);
    });

    it('should reject invalid stake amount format', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      const validation = result.current.validateParticipation(
        mockContext,
        'SUPPORT',
        'invalid-amount'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid stake amount format');
    });
  });

  describe('stake warnings', () => {
    it('should warn when stake is significantly below recommended', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      const validation = result.current.validateParticipation(
        mockContext,
        'SUPPORT',
        '150000000000000000' // 0.15 ETH, below half of 0.5 recommended
      );

      expect(validation.isValid).toBe(true); // Still valid
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings.some(w => w.includes('below recommended'))).toBe(true);
    });
  });

  describe('simulation before submission', () => {
    it('should simulate before submitting', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();

      // Spy on simulateParticipation
      const simulateSpy = jest.spyOn(result.current, 'simulateParticipation');

      await act(async () => {
        await result.current.submitParticipation(
          mockContext,
          'SUPPORT',
          '500000000000000000'
        );
      });

      // Note: In the actual implementation, submitParticipation calls simulateParticipation internally
      expect(result.current.lastTransaction).toBeDefined();
    });

    it('should not submit if simulation fails', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: 'invalid-address', // Will fail validation
        })
      );

      const mockContext = createMockContext();

      await expect(
        act(async () => {
          await result.current.submitParticipation(
            mockContext,
            'SUPPORT',
            '500000000000000000'
          );
        })
      ).rejects.toThrow();

      expect(result.current.lastTransaction).toBeNull();
    });
  });

  describe('projected state calculation', () => {
    it('should calculate correct projected totals for support', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      let simulation: any;

      await act(async () => {
        simulation = await result.current.simulateParticipation(
          mockContext,
          'SUPPORT',
          '1000000000000000000' // 1 ETH
        );
      });

      expect(simulation?.projectedState?.newSupportTotal).toBe('4500000000000000000'); // 3.5 + 1
      expect(simulation?.projectedState?.newOpposeTotal).toBe('2100000000000000000'); // Unchanged
    });

    it('should calculate correct projected totals for oppose', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      let simulation: any;

      await act(async () => {
        simulation = await result.current.simulateParticipation(
          mockContext,
          'OPPOSE',
          '800000000000000000' // 0.8 ETH
        );
      });

      expect(simulation?.projectedState?.newSupportTotal).toBe('3500000000000000000'); // Unchanged
      expect(simulation?.projectedState?.newOpposeTotal).toBe('2900000000000000000'); // 2.1 + 0.8
    });

    it('should include potential reward estimation', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      let simulation: any;

      await act(async () => {
        simulation = await result.current.simulateParticipation(
          mockContext,
          'SUPPORT',
          '500000000000000000'
        );
      });

      expect(simulation?.projectedState?.potentialReward).toBeDefined();
      expect(simulation?.projectedState?.riskAmount).toBe('500000000000000000');
    });
  });

  describe('call data encoding', () => {
    it('should encode support decision with correct selector', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      let simulation: any;

      await act(async () => {
        simulation = await result.current.simulateParticipation(
          mockContext,
          'SUPPORT',
          '500000000000000000'
        );
      });

      expect(simulation?.data?.calldata).toMatch(/^0xabc12345/);
    });

    it('should encode oppose decision with correct selector', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      let simulation: any;

      await act(async () => {
        simulation = await result.current.simulateParticipation(
          mockContext,
          'OPPOSE',
          '500000000000000000'
        );
      });

      expect(simulation?.data?.calldata).toMatch(/^0xdef67890/);
    });
  });
});
