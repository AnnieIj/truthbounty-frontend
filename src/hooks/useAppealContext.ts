/**
 * Hook for reading appeal participation context from contract and indexer
 * Fetches snapshot, deadline, stake bounds, and wallet position
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId, useBlockNumber } from 'wagmi';
import {
  AppealSnapshot,
  AppealDeadline,
  AppealStakeBounds,
  AppealWalletPosition,
  AppealParticipationContext,
  AppealState,
} from '@/app/types/appeal';
import { getReleaseChainId } from '@/lib/contracts/registry';

interface UseAppealContextConfig {
  appealId: string;
  claimId: string;
  contractAddress: string;
  expectedChainId?: number;
  pollInterval?: number; // ms
}

interface AppealContextResult {
  context: AppealParticipationContext | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const OPTIMISM_MAINNET_CHAIN_ID = 10;
const OPTIMISM_SEPOLIA_CHAIN_ID = 11155420;
const DEFAULT_POLL_INTERVAL = 10000; // 10 seconds

/**
 * Fetch appeal participation context from contract and indexer
 * Provides snapshot, deadline, stake bounds, and wallet position
 */
export function useAppealContext(
  config: UseAppealContextConfig
): AppealContextResult {
  const {
    appealId,
    claimId,
    contractAddress,
    expectedChainId = getReleaseChainId(),
    pollInterval = DEFAULT_POLL_INTERVAL,
  } = config;

  const { address: userAddress, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { data: currentBlockNumber } = useBlockNumber({ watch: true });

  const [context, setContext] = useState<AppealParticipationContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Validate basic connectivity and configuration
   */
  const validateConfiguration = useCallback((): string | null => {
    if (!isConnected || !userAddress) {
      return 'Wallet not connected';
    }

    if (currentChainId !== expectedChainId) {
      return `Wrong network. Expected chain ${expectedChainId}, got ${currentChainId}`;
    }

    if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format';
    }

    if (!appealId || !claimId) {
      return 'Invalid appeal or claim ID';
    }

    return null;
  }, [isConnected, userAddress, currentChainId, expectedChainId, contractAddress, appealId, claimId]);

  /**
   * Fetch appeal snapshot from contract/indexer
   * In production: queries contract.getAppealSnapshot(appealId) and indexer API
   */
  const fetchAppealSnapshot = useCallback(
    async (appealIdParam: string): Promise<AppealSnapshot> => {
      try {
        // In production, this would:
        // 1. Call contract.getAppeal(appealId) via Viem readContract
        // 2. Query indexer GET /api/appeals/:appealId for rich metadata
        // 3. Combine on-chain immutable data with indexed historical data

        // Mock implementation - replace with real contract/API calls
        const mockSnapshot: AppealSnapshot = {
          appealId: appealIdParam,
          claimId,
          disputeId: `dispute-${claimId}`,
          initiatorAddress: '0x' + '1'.repeat(40),
          initiatorStake: '1000000000000000000', // 1 ETH in wei
          firstRoundDecision: 'VERIFIED',
          firstRoundVotesFor: 15,
          firstRoundVotesAgainst: 8,
          reason: 'First round verification was compromised',
          initiatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          blockNumber: 12345678 - 7200, // ~24h ago on Optimism (2s blocks)
        };

        return mockSnapshot;
      } catch (err) {
        throw new Error(`Failed to fetch appeal snapshot: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [claimId, currentBlockNumber]
  );

  /**
   * Fetch appeal deadline information
   * In production: queries contract deadline + calculates time remaining
   */
  const fetchAppealDeadline = useCallback(
    async (appealIdParam: string, snapshotBlockNumber: number): Promise<AppealDeadline> => {
      try {
        // In production, this would:
        // 1. Call contract.getAppealDeadline(appealId) for endBlock
        // 2. Use current block number to calculate blocks remaining
        // 3. Estimate time remaining based on block time (2s on Optimism)
        // 4. Query indexer for precise timestamps

        const APPEAL_PERIOD_BLOCKS = 43200; // 24 hours on Optimism (2s blocks)
        const OPTIMISM_BLOCK_TIME_SECONDS = 2;

        const endBlock = snapshotBlockNumber + APPEAL_PERIOD_BLOCKS;
        const currentBlock = currentBlockNumber ? Number(currentBlockNumber) : snapshotBlockNumber + 7200;
        const blocksRemaining = Math.max(0, endBlock - currentBlock);
        const timeRemainingSeconds = blocksRemaining * OPTIMISM_BLOCK_TIME_SECONDS;

        const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const endTime = new Date(Date.now() + timeRemainingSeconds * 1000).toISOString();

        const mockDeadline: AppealDeadline = {
          appealId: appealIdParam,
          startTime,
          endTime,
          timeRemaining: timeRemainingSeconds,
          endBlock,
          currentBlock,
          blocksRemaining,
          isActive: blocksRemaining > 0,
          hasEnded: blocksRemaining === 0,
        };

        return mockDeadline;
      } catch (err) {
        throw new Error(`Failed to fetch appeal deadline: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [currentBlockNumber]
  );

  /**
   * Fetch stake bounds for appeal participation
   * In production: queries contract stake parameters + current participation totals
   */
  const fetchStakeBounds = useCallback(
    async (appealIdParam: string): Promise<AppealStakeBounds> => {
      try {
        // In production, this would:
        // 1. Call contract.getAppealStakeRequirements(appealId) for min/max
        // 2. Call contract.getAppealTotals(appealId) for current stakes
        // 3. Query indexer for participant counts
        // 4. Calculate recommended stake based on existing distribution

        const mockBounds: AppealStakeBounds = {
          appealId: appealIdParam,
          minStake: '100000000000000000', // 0.1 ETH minimum
          maxStake: '10000000000000000000', // 10 ETH maximum
          recommendedStake: '500000000000000000', // 0.5 ETH recommended
          totalSupportStake: '3500000000000000000', // 3.5 ETH supporting
          totalOpposeStake: '2100000000000000000', // 2.1 ETH opposing
          supporterCount: 7,
          opposerCount: 4,
        };

        return mockBounds;
      } catch (err) {
        throw new Error(`Failed to fetch stake bounds: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    []
  );

  /**
   * Fetch user's wallet position in the appeal
   * In production: queries contract for existing participation + wallet balance
   */
  const fetchWalletPosition = useCallback(
    async (appealIdParam: string, minStake: string): Promise<AppealWalletPosition> => {
      try {
        if (!userAddress) {
          throw new Error('User address not available');
        }

        // In production, this would:
        // 1. Call contract.getUserAppealParticipation(appealId, userAddress)
        // 2. Call ERC20.balanceOf(userAddress) for token balance
        // 3. Query indexer GET /api/appeals/:appealId/participants/:userAddress
        // 4. Check transaction history for existing participation

        // Mock implementation - assume user hasn't participated yet
        const mockBalance = '5000000000000000000'; // 5 ETH
        const minStakeBigInt = BigInt(minStake);
        const balanceBigInt = BigInt(mockBalance);

        const mockPosition: AppealWalletPosition = {
          appealId: appealIdParam,
          userAddress,
          hasParticipated: false,
          // No existing participation in this mock
          currentBalance: mockBalance,
          hasMinimumBalance: balanceBigInt >= minStakeBigInt,
        };

        return mockPosition;
      } catch (err) {
        throw new Error(`Failed to fetch wallet position: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [userAddress]
  );

  /**
   * Compute eligibility based on all context data
   */
  const computeEligibility = useCallback(
    (
      deadline: AppealDeadline,
      position: AppealWalletPosition
    ): { isEligible: boolean; ineligibilityReason?: string } => {
      // Check if appeal is still active
      if (!deadline.isActive) {
        return {
          isEligible: false,
          ineligibilityReason: 'Appeal period has ended',
        };
      }

      // Check if user already participated
      if (position.hasParticipated) {
        return {
          isEligible: false,
          ineligibilityReason: 'You have already participated in this appeal',
        };
      }

      // Check if user has sufficient balance
      if (!position.hasMinimumBalance) {
        return {
          isEligible: false,
          ineligibilityReason: 'Insufficient balance to meet minimum stake requirement',
        };
      }

      return { isEligible: true };
    },
    []
  );

  /**
   * Main fetch logic - assembles complete context
   */
  const fetchContext = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate configuration
      const configError = validateConfiguration();
      if (configError) {
        setError(configError);
        setContext(null);
        setIsLoading(false);
        return;
      }

      // Fetch all components in parallel for efficiency
      const [snapshot, stakeBounds] = await Promise.all([
        fetchAppealSnapshot(appealId),
        fetchStakeBounds(appealId),
      ]);

      // Fetch deadline (needs snapshot block number)
      const deadline = await fetchAppealDeadline(appealId, snapshot.blockNumber);

      // Fetch wallet position (needs min stake from bounds)
      const walletPosition = await fetchWalletPosition(appealId, stakeBounds.minStake);

      // Compute eligibility
      const { isEligible, ineligibilityReason } = computeEligibility(deadline, walletPosition);

      // Assemble complete context
      const fullContext: AppealParticipationContext = {
        snapshot,
        deadline,
        stakeBounds,
        walletPosition,
        isEligible,
        ineligibilityReason,
      };

      setContext(fullContext);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch appeal context';
      setError(errorMsg);
      setContext(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    appealId,
    validateConfiguration,
    fetchAppealSnapshot,
    fetchAppealDeadline,
    fetchStakeBounds,
    fetchWalletPosition,
    computeEligibility,
  ]);

  /**
   * Poll for context updates
   */
  useEffect(() => {
    const configError = validateConfiguration();
    if (configError) {
      setError(configError);
      setContext(null);
      return;
    }

    void fetchContext();
    const interval = setInterval(() => {
      void fetchContext();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [isConnected, userAddress, currentChainId, expectedChainId, contractAddress, appealId, claimId, fetchContext, pollInterval, validateConfiguration]);

  /**
   * Refetch on block number changes (for deadline updates)
   */
  useEffect(() => {
    if (!isConnected || !appealId || !context) return;

    // Only update deadline, don't refetch everything
    if (context.snapshot) {
      fetchAppealDeadline(appealId, context.snapshot.blockNumber).then((deadline) => {
        const { isEligible, ineligibilityReason } = computeEligibility(
          deadline,
          context.walletPosition
        );

        setContext((prev) =>
          prev
            ? {
                ...prev,
                deadline,
                isEligible,
                ineligibilityReason,
              }
            : null
        );
      });
    }
  }, [currentBlockNumber]); // Intentionally not including all deps to avoid refetch loop

  return {
    context,
    isLoading,
    error,
    refetch: fetchContext,
  };
}
