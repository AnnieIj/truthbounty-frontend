/**
 * Integration tests for the appeal participation flow.
 * Covers context fetch → validation → simulation → submission → reconciliation
 * using the real ABI-driven participation flow (never fabricated calldata or hashes).
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { toFunctionSelector } from 'viem';
import { useAppealContext } from '@/hooks/useAppealContext';
import { useAppealParticipation } from '@/hooks/useAppealParticipation';
import { useAppealReconciliation } from '@/hooks/useAppealReconciliation';
import {
  MOCK_ADDRESS_1,
  MOCK_TX_HASH_1,
} from '@/__tests__/mocks/wagmi/mock-wagmi';
import * as wagmi from 'wagmi';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  useBlockNumber: jest.fn(),
  useWaitForTransactionReceipt: jest.fn(),
  usePublicClient: jest.fn(),
  useWriteContract: jest.fn(),
}));

const mockContractAddress = '0x1234567890abcdef1234567890abcdef12345678';
const mockUserAddress = MOCK_ADDRESS_1;
const OPTIMISM_MAINNET = 10;
const TX_HASH = MOCK_TX_HASH_1;
const APPEAL_ID = '0x' + 'ab'.repeat(32);

const TEST_ABI = [
  {
    type: 'function',
    name: 'participateInAppeal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'appealId', type: 'bytes32' },
      { name: 'support', type: 'bool' },
      { name: 'stakeAmount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const PARTICIPATE_SELECTOR = toFunctionSelector(
  'participateInAppeal(bytes32,bool,uint256)'
);

const mockSimulateContract = jest.fn();
const mockGetTransactionReceipt = jest.fn();
const mockReadContract = jest.fn();
const mockWriteContractAsync = jest.fn();

function renderAppealHook(config: Record<string, unknown> = {}) {
  return renderHook(() =>
    useAppealParticipation({
      contractAddress: mockContractAddress,
      abi: TEST_ABI,
      expectedChainId: OPTIMISM_MAINNET,
      ...config,
    })
  );
}

describe('Appeal Participation Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (wagmi.useAccount as jest.Mock).mockReturnValue({
      address: mockUserAddress,
      isConnected: true,
    });
    (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_MAINNET);
    (wagmi.useBlockNumber as jest.Mock).mockReturnValue({
      data: BigInt(12345678),
    });
    mockSimulateContract.mockResolvedValue({ request: {} });
    mockGetTransactionReceipt.mockResolvedValue({
      transactionHash: TX_HASH,
      status: '0x1',
      blockNumber: 1234n,
      gasUsed: 21000n,
      chainId: OPTIMISM_MAINNET,
    });
    mockReadContract.mockResolvedValue(0n);
    (wagmi.usePublicClient as jest.Mock).mockReturnValue({
      simulateContract: mockSimulateContract,
      getTransactionReceipt: mockGetTransactionReceipt,
      readContract: mockReadContract,
    });
    mockWriteContractAsync.mockResolvedValue(TX_HASH);
    (wagmi.useWriteContract as jest.Mock).mockReturnValue({
      writeContractAsync: mockWriteContractAsync,
    });
  });

  describe('complete participation flow', () => {
    it('should complete full flow: fetch context → validate → simulate → submit → reconcile', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: APPEAL_ID,
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
          pollInterval: 100000,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).not.toBeNull();
      });

      const context = contextResult.current.context!;
      expect(context.isEligible).toBe(true);

      const { result: participationResult } = renderAppealHook();

      const validation = participationResult.current.validateParticipation(
        context,
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      let simulation: any;
      await act(async () => {
        simulation = await participationResult.current.simulateParticipation(
          context,
          'SUPPORT',
          '500000000000000000'
        );
      });

      expect(simulation?.success).toBe(true);
      expect(simulation?.data?.calldata.startsWith(PARTICIPATE_SELECTOR)).toBe(
        true
      );

      let transaction: any;
      await act(async () => {
        transaction = await participationResult.current.submitParticipation(
          context,
          'SUPPORT',
          '500000000000000000'
        );
      });

      expect(transaction).toBeDefined();
      expect(transaction?.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(transaction?.status).toBe('CONFIRMED');

      (wagmi.useWaitForTransactionReceipt as jest.Mock).mockReturnValue({
        data: {
          status: 'success',
          transactionHash: transaction?.transactionHash,
          blockNumber: BigInt(12345680),
        },
        isLoading: false,
        error: null,
      });

      const { result: reconciliationResult } = renderHook(() =>
        useAppealReconciliation({
          transaction: transaction!,
        })
      );

      await waitFor(() => {
        expect(reconciliationResult.current.result).not.toBeNull();
      });

      expect(reconciliationResult.current.result?.status).toBe('confirmed');
      expect(
        reconciliationResult.current.result?.position.hasParticipated
      ).toBe(true);
      expect(reconciliationResult.current.stateSegregation).not.toBeNull();
      expect(
        reconciliationResult.current.stateSegregation?.statesAreIndependent
      ).toBe(true);
    });

    it('should handle oppose decision in complete flow', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: APPEAL_ID,
          claimId: 'claim-789',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderAppealHook();

      let transaction: any;
      await act(async () => {
        transaction = await participationResult.current.submitParticipation(
          contextResult.current.context!,
          'OPPOSE',
          '300000000000000000'
        );
      });

      expect(transaction?.decision).toBe('OPPOSE');
      expect(transaction?.stakeAmount).toBe('300000000000000000');
    });
  });

  describe('error handling in flow', () => {
    it('should stop flow when context fetch fails', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: undefined,
        isConnected: false,
      });

      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: APPEAL_ID,
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.error).toBeDefined();
      });

      expect(contextResult.current.context).toBeNull();
      expect(contextResult.current.error).toContain('Wallet not connected');
    });

    it('should stop flow when validation fails', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: APPEAL_ID,
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderAppealHook();

      await act(async () => {
        await expect(
          participationResult.current.submitParticipation(
            contextResult.current.context!,
            'SUPPORT',
            '50000000000000000' // Below minimum
          )
        ).rejects.toThrow('Stake amount below minimum');
      });
    });

    it('should handle transaction revert in reconciliation', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: APPEAL_ID,
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderAppealHook();

      let transaction: any;
      await act(async () => {
        transaction = await participationResult.current.submitParticipation(
          contextResult.current.context!,
          'SUPPORT',
          '500000000000000000'
        );
      });

      (wagmi.useWaitForTransactionReceipt as jest.Mock).mockReturnValue({
        data: {
          status: 'reverted',
          transactionHash: transaction?.transactionHash,
        },
        isLoading: false,
        error: null,
      });

      const { result: reconciliationResult } = renderHook(() =>
        useAppealReconciliation({
          transaction: transaction!,
        })
      );

      await waitFor(() => {
        expect(reconciliationResult.current.result).not.toBeNull();
      });

      expect(reconciliationResult.current.result?.status).toBe('reverted');
      expect(
        reconciliationResult.current.result?.position.hasParticipated
      ).toBe(false);
    });
  });

  describe('state segregation throughout flow', () => {
    it('should maintain state segregation from context to reconciliation', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: APPEAL_ID,
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).not.toBeNull();
      });

      const { result: participationResult } = renderAppealHook();

      let transaction: any;
      await act(async () => {
        transaction = await participationResult.current.submitParticipation(
          contextResult.current.context!,
          'SUPPORT',
          '500000000000000000'
        );
      });

      (wagmi.useWaitForTransactionReceipt as jest.Mock).mockReturnValue({
        data: {
          status: 'success',
          transactionHash: transaction?.transactionHash,
        },
        isLoading: false,
        error: null,
      });

      const { result: reconciliationResult } = renderHook(() =>
        useAppealReconciliation({
          transaction: transaction!,
        })
      );

      await waitFor(() => {
        expect(reconciliationResult.current.stateSegregation).not.toBeNull();
      });

      const segregation = reconciliationResult.current.stateSegregation!;

      expect(segregation.claimId).toBe('claim-456');
      expect(segregation.appealState.appealId).toBe(APPEAL_ID);
      expect(segregation.appealState.decision).toBe('SUPPORT');
      expect(segregation.appealState.status).toBe('CONFIRMED');
      expect(segregation.statesAreIndependent).toBe(true);
    });
  });

  describe('real-time updates during flow', () => {
    it('should update context when blocks advance during participation', async () => {
      const { result: contextResult, rerender } = renderHook(() =>
        useAppealContext({
          appealId: APPEAL_ID,
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).not.toBeNull();
      });

      const initialBlocksRemaining =
        contextResult.current.context!.deadline.blocksRemaining;

      (wagmi.useBlockNumber as jest.Mock).mockReturnValue({
        data: BigInt(12345700),
      });

      rerender();

      await waitFor(() => {
        expect(
          contextResult.current.context?.deadline.blocksRemaining
        ).not.toBe(initialBlocksRemaining);
      });
    });
  });

  describe('concurrent participation attempts', () => {
    it('should prevent double submission', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: APPEAL_ID,
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderAppealHook();

      let firstTransaction: any;
      await act(async () => {
        firstTransaction =
          await participationResult.current.submitParticipation(
            contextResult.current.context!,
            'SUPPORT',
            '500000000000000000'
          );
      });

      expect(firstTransaction).toBeDefined();

      const updatedContext = {
        ...contextResult.current.context!,
        walletPosition: {
          ...contextResult.current.context!.walletPosition,
          hasParticipated: true,
          existingDecision: 'SUPPORT' as const,
        },
        isEligible: false,
        ineligibilityReason: 'Already participated',
      };

      const validation = participationResult.current.validateParticipation(
        updatedContext,
        'OPPOSE',
        '300000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'You have already participated in this appeal'
      );
    });
  });

  describe('real simulation data', () => {
    it('should surface real calldata and never fabricate gas or projections', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: APPEAL_ID,
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderAppealHook();

      const stakeAmount = '1000000000000000000'; // 1 ETH
      let simulation: any;

      await act(async () => {
        simulation = await participationResult.current.simulateParticipation(
          contextResult.current.context!,
          'SUPPORT',
          stakeAmount
        );
      });

      expect(simulation?.success).toBe(true);
      expect(simulation?.data?.calldata.startsWith(PARTICIPATE_SELECTOR)).toBe(
        true
      );
      expect(simulation?.gasEstimate).toBeUndefined();
      expect(simulation?.projectedState).toBeUndefined();
      expect(simulation?.data?.calldata).toBeDefined();
    });
  });
});