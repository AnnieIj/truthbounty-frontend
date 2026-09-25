/**
 * Unit tests for useAppealParticipation (V2-FE-059).
 * Covers canonical simulation/submission, validation, stale-round rejection,
 * and absence of fabricated tx hashes / synthetic selectors.
 */

import { renderHook, act } from '@testing-library/react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from 'wagmi';
import { useAppealParticipation } from '../useAppealParticipation';
import {
  AppealParticipationContext,
  AppealSnapshot,
  AppealDeadline,
  AppealStakeBounds,
  AppealWalletPosition,
} from '@/app/types/appeal';
import { encodeParticipateInAppeal, toAppealIdBytes32 } from '@/lib/appeal/round-progression';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  usePublicClient: jest.fn(),
  useWriteContract: jest.fn(),
}));

const mockContractAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
const mockUserAddress = '0x1234567890123456789012345678901234567890';
const OPTIMISM_MAINNET = 10;
const TX_HASH = `0x${'ab'.repeat(32)}`;

const mockedUseAccount = useAccount as jest.Mock;
const mockedUseChainId = useChainId as jest.Mock;
const mockedUsePublicClient = usePublicClient as jest.Mock;
const mockedUseWriteContract = useWriteContract as jest.Mock;

const mockWriteContractAsync = jest.fn();
const mockSimulateContract = jest.fn();
const mockEstimateContractGas = jest.fn();
const mockReadContract = jest.fn();

function createMockContext(
  overrides?: Partial<AppealParticipationContext>
): AppealParticipationContext {
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
    minStake: '100000000000000000',
    maxStake: '10000000000000000000',
    recommendedStake: '500000000000000000',
    totalSupportStake: '3500000000000000000',
    totalOpposeStake: '2100000000000000000',
    supporterCount: 7,
    opposerCount: 4,
  };

  const walletPosition: AppealWalletPosition = {
    appealId: 'appeal-123',
    userAddress: mockUserAddress,
    hasParticipated: false,
    currentBalance: '5000000000000000000',
    hasMinimumBalance: true,
  };

  return {
    snapshot,
    deadline,
    stakeBounds,
    walletPosition,
    roundProgression: {
      appealId: 'appeal-123',
      roundNumber: 1,
      requiredBond: '100000000000000000',
      deadlineSeconds: Math.floor(Date.now() / 1000) + 3600,
      timeRemainingSeconds: 3600,
      supportStake: '3500000000000000000',
      opposeStake: '2100000000000000000',
      state: 'ACTIVE',
      isActive: true,
      hasEnded: false,
      roundMatchesExpected: true,
      expectedRound: 1,
    },
    isEligible: true,
    ...overrides,
  };
}

function installMocks() {
  mockedUseAccount.mockReturnValue({
    address: mockUserAddress,
    isConnected: true,
  });
  mockedUseChainId.mockReturnValue(OPTIMISM_MAINNET);
  mockWriteContractAsync.mockResolvedValue(TX_HASH);
  mockedUseWriteContract.mockReturnValue({
    writeContractAsync: mockWriteContractAsync,
  });
  mockSimulateContract.mockResolvedValue({ request: {} });
  mockEstimateContractGas.mockResolvedValue(180000n);
  mockReadContract.mockImplementation(
    ({ functionName }: { functionName: string }) => {
      if (functionName === 'getAppealRound') {
        return Promise.resolve({
          roundNumber: 1n,
          requiredBond: 100000000000000000n,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
          supportStake: 3500000000000000000n,
          opposeStake: 2100000000000000000n,
          state: 1,
          claimId: toAppealIdBytes32('claim-456'),
        });
      }
      if (functionName === 'allowance') {
        return Promise.resolve(10n ** 24n);
      }
      return Promise.resolve(null);
    }
  );
  mockedUsePublicClient.mockReturnValue({
    simulateContract: mockSimulateContract,
    estimateContractGas: mockEstimateContractGas,
    readContract: mockReadContract,
    getTransactionReceipt: jest.fn(),
  });
}

describe('useAppealParticipation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installMocks();
  });

  describe('successful participation', () => {
    it('simulates support with canonical calldata and projected totals', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const mockContext = createMockContext();
      let simulation: Awaited<
        ReturnType<typeof result.current.simulateParticipation>
      >;

      await act(async () => {
        simulation = await result.current.simulateParticipation(
          mockContext,
          'SUPPORT',
          '500000000000000000'
        );
      });

      expect(simulation!.success).toBe(true);
      expect(simulation!.gasEstimate).toBe('180000');
      expect(simulation!.projectedState?.newSupportTotal).toBe(
        '4000000000000000000'
      );
      expect(simulation!.projectedState?.potentialReward).toBeUndefined();

      const expected = encodeParticipateInAppeal({
        appealId: toAppealIdBytes32('appeal-123'),
        decision: 'SUPPORT',
        stakeAmount: 500000000000000000n,
        expectedRound: 1n,
      });
      expect(simulation!.data?.calldata).toBe(expected.calldata);
      expect(simulation!.data?.calldata.startsWith('0xabc12345')).toBe(false);
    });

    it('simulates oppose decision successfully', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      let simulation: Awaited<
        ReturnType<typeof result.current.simulateParticipation>
      >;
      await act(async () => {
        simulation = await result.current.simulateParticipation(
          createMockContext(),
          'OPPOSE',
          '300000000000000000'
        );
      });

      expect(simulation!.success).toBe(true);
      expect(simulation!.projectedState?.newOpposeTotal).toBe(
        '2400000000000000000'
      );
    });

    it('submits via writeContractAsync and returns the wallet tx hash', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      let transaction: Awaited<
        ReturnType<typeof result.current.submitParticipation>
      >;
      await act(async () => {
        transaction = await result.current.submitParticipation(
          createMockContext(),
          'SUPPORT',
          '500000000000000000'
        );
      });

      expect(mockWriteContractAsync).toHaveBeenCalled();
      expect(transaction!.transactionHash).toBe(TX_HASH);
      expect(transaction!.from).toBe(mockUserAddress);
      expect(transaction!.to.toLowerCase()).toBe(
        mockContractAddress.toLowerCase()
      );
      expect(transaction!.status).toBe('PENDING');
      expect(transaction!.decision).toBe('SUPPORT');
      expect(transaction!.expectedRound).toBe(1);
    });

    it('tracks last transaction', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      await act(async () => {
        await result.current.submitParticipation(
          createMockContext(),
          'OPPOSE',
          '200000000000000000'
        );
      });

      expect(result.current.lastTransaction?.decision).toBe('OPPOSE');
      expect(result.current.lastTransaction?.stakeAmount).toBe(
        '200000000000000000'
      );
    });
  });

  describe('validation errors', () => {
    it('rejects when appeal has ended', () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext({
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
        }),
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Appeal period has ended or has not started'
      );
      expect(validation.checks.appealActive).toBe(false);
    });

    it('rejects when wallet not connected', () => {
      mockedUseAccount.mockReturnValue({
        address: undefined,
        isConnected: false,
      });

      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Wallet not connected');
      expect(validation.checks.walletConnected).toBe(false);
    });

    it('rejects when on wrong network', () => {
      mockedUseChainId.mockReturnValue(1);

      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
          expectedChainId: OPTIMISM_MAINNET,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Wrong network'))).toBe(
        true
      );
      expect(validation.checks.correctChain).toBe(false);
    });

    it('rejects when user already participated', () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext({
          walletPosition: {
            appealId: 'appeal-123',
            userAddress: mockUserAddress,
            hasParticipated: true,
            existingDecision: 'SUPPORT',
            existingStake: '500000000000000000',
            participatedAt: new Date().toISOString(),
            transactionHash: TX_HASH,
            currentBalance: '4500000000000000000',
            hasMinimumBalance: true,
          },
        }),
        'OPPOSE',
        '300000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'You have already participated in this appeal'
      );
      expect(validation.checks.notAlreadyParticipated).toBe(false);
    });

    it('rejects stale-round participation', () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext({
          roundProgression: {
            appealId: 'appeal-123',
            roundNumber: 2,
            requiredBond: '100000000000000000',
            deadlineSeconds: Math.floor(Date.now() / 1000) + 3600,
            timeRemainingSeconds: 3600,
            supportStake: '0',
            opposeStake: '0',
            state: 'ACTIVE',
            isActive: true,
            hasEnded: false,
            roundMatchesExpected: false,
            expectedRound: 1,
          },
        }),
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.checks.roundCurrent).toBe(false);
      expect(validation.errors.some((e) => /Stale round/i.test(e))).toBe(true);
    });

    it('rejects stake below minimum', () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext(),
        'SUPPORT',
        '50000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('below minimum'))).toBe(
        true
      );
    });

    it('rejects stake above maximum', () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext(),
        'SUPPORT',
        '15000000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('exceeds maximum'))).toBe(
        true
      );
    });

    it('rejects insufficient balance', () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext({
          walletPosition: {
            appealId: 'appeal-123',
            userAddress: mockUserAddress,
            hasParticipated: false,
            currentBalance: '50000000000000000',
            hasMinimumBalance: false,
          },
        }),
        'SUPPORT',
        '100000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Insufficient balance for stake amount'
      );
    });

    it('rejects invalid contract address', () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: 'invalid-address',
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid contract address format');
    });

    it('rejects invalid stake amount format', () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext(),
        'SUPPORT',
        'invalid-amount'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid stake amount format');
    });
  });

  describe('simulation before submission', () => {
    it('does not submit if simulation fails', async () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: 'invalid-address',
        })
      );

      await expect(
        act(async () => {
          await result.current.submitParticipation(
            createMockContext(),
            'SUPPORT',
            '500000000000000000'
          );
        })
      ).rejects.toThrow();

      expect(result.current.lastTransaction).toBeNull();
      expect(mockWriteContractAsync).not.toHaveBeenCalled();
    });

    it('fails closed when eth_call simulation reverts', async () => {
      mockSimulateContract.mockRejectedValueOnce(
        new Error('execution reverted: AppealRoundClosed')
      );

      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      let simulation: Awaited<
        ReturnType<typeof result.current.simulateParticipation>
      >;
      await act(async () => {
        simulation = await result.current.simulateParticipation(
          createMockContext(),
          'SUPPORT',
          '500000000000000000'
        );
      });

      expect(simulation!.success).toBe(false);
      expect(simulation!.error).toMatch(/AppealRoundClosed|reverted/i);
    });
  });

  describe('stake warnings', () => {
    it('warns when stake is significantly below recommended', () => {
      const { result } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const validation = result.current.validateParticipation(
        createMockContext(),
        'SUPPORT',
        '150000000000000000'
      );

      expect(validation.isValid).toBe(true);
      expect(
        validation.warnings.some((w) => w.includes('below recommended'))
      ).toBe(true);
    });
  });
});
