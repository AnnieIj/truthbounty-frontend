/**
 * Hook for fetching dispute context (provisional outcome, deadline, bond, wallet position)
 * Provides all data needed to decide whether to open a dispute/challenge
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useBlockNumber, useChainId } from 'wagmi';
import {
  ProvisionalOutcome,
  DisputeDeadline,
  ChallengeBond,
  DisputeWalletPosition,
  DisputeContext,
} from '@/app/types/dispute';
import { getReleaseChainId } from '@/lib/contracts/registry';

interface UseDisputeContextConfig {
  claimId: string;
  contractAddress: string;
  expectedChainId?: number;
  pollInterval?: number; // ms, default 10000 (10s)
  enabled?: boolean;
}

interface DisputeContextResult {
  context: DisputeContext | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const OPTIMISM_MAINNET_CHAIN_ID = 10;
const OPTIMISM_SEPOLIA_CHAIN_ID = 11155420;
const DEFAULT_POLL_INTERVAL = 10000; // 10 seconds

/**
 * Hook for fetching complete dispute context
 * Combines provisional outcome, deadline, bond, and wallet eligibility
 */
export function useDisputeContext(
  config: UseDisputeContextConfig
): DisputeContextResult {
  const {
    claimId,
    contractAddress,
    expectedChainId = getReleaseChainId(),
    pollInterval = DEFAULT_POLL_INTERVAL,
    enabled = true,
  } = config;

  const { address: userAddress, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const [context, setContext] = useState<DisputeContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch provisional outcome from contract/indexer
   */
  const fetchProvisionalOutcome = useCallback(
    async (claimIdParam: string): Promise<ProvisionalOutcome> => {
      // In production, this would:
      // 1. Call contract.getClaimOutcome(claimId)
      // 2. Query indexer GET /api/claims/:claimId/outcome for rich metadata
      // 3. Validate outcome is provisional (dispute window still open)

      // Mock implementation
      const mockOutcome: ProvisionalOutcome = {
        claimId: claimIdParam,
        decision: 'VERIFIED',
        votesFor: 7,
        votesAgainst: 3,
        totalStake: '5000000000000000000', // 5 ETH
        outcomeAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        outcomeBlock: 12345600,
        isProvisional: true,
        isFinalized: false,
      };

      return mockOutcome;
    },
    []
  );

  /**
   * Fetch dispute deadline from contract/indexer
   */
  const fetchDisputeDeadline = useCallback(
    async (
      claimIdParam: string,
      currentBlockNum: number
    ): Promise<DisputeDeadline> => {
      // In production, this would:
      // 1. Call contract.getDisputeDeadline(claimId)
      // 2. Calculate time remaining from block.timestamp
      // 3. Check if dispute already opened via contract.disputes(claimId)

      const initialStartBlock = 12345678;
      const windowStartTime = new Date(Date.now() - 3600000); // 1 hour ago
      const windowEndTime = new Date(Date.now() + 82800000); // 23 hours from now
      const windowEndBlock = initialStartBlock + 41400; // ~23 hours at 2s/block

      const timeRemaining = Math.max(
        0,
        Math.floor((windowEndTime.getTime() - Date.now()) / 1000)
      );
      const blocksRemaining = Math.max(0, windowEndBlock - currentBlockNum);

      const mockDeadline: DisputeDeadline = {
        claimId: claimIdParam,
        windowStartTime: windowStartTime.toISOString(),
        windowEndTime: windowEndTime.toISOString(),
        timeRemaining,
        windowEndBlock,
        currentBlock: currentBlockNum,
        blocksRemaining,
        isWindowOpen: timeRemaining > 0 && blocksRemaining > 0,
        isWindowClosed: timeRemaining === 0 || blocksRemaining === 0,
        hasActiveDispute: false,
      };

      return mockDeadline;
    },
    []
  );

  /**
   * Fetch challenge bond requirements from contract
   */
  const fetchChallengeBond = useCallback(
    async (claimIdParam: string): Promise<ChallengeBond> => {
      // In production, this would:
      // 1. Call contract.getChallengeBond(claimId)
      // 2. Calculate slash amount (typically 10-20% of bond)
      // 3. Calculate potential reward (typically 1.5-2x bond if successful)

      // Mock implementation
      const bondAmount = '1000000000000000000'; // 1 ETH
      const slashPercentage = 10; // 10%
      const slashAmount = '100000000000000000'; // 0.1 ETH
      const rewardMultiplier = 1.5;
      const potentialReward = '1500000000000000000'; // 1.5 ETH

      const mockBond: ChallengeBond = {
        claimId: claimIdParam,
        bondAmount,
        slashAmount,
        slashPercentage,
        potentialReward,
        rewardMultiplier,
      };

      return mockBond;
    },
    []
  );

  /**
   * Fetch wallet position and eligibility
   */
  const fetchWalletPosition = useCallback(
    async (
      claimIdParam: string,
      bondAmount: string,
      walletAddress: string
    ): Promise<DisputeWalletPosition> => {
      // In production, this would:
      // 1. Call contract.balanceOf(userAddress)
      // 2. Call contract.hasParticipated(claimId, userAddress)
      // 3. Call contract.disputes(claimId).challenger to check if already opened
      // 4. Validate sufficient balance for bond

      // Mock implementation
      const currentBalance = '5000000000000000000'; // 5 ETH
      const bondBigInt = BigInt(bondAmount);
      const balanceBigInt = BigInt(currentBalance);

      const hasSufficientBalance = balanceBigInt >= bondBigInt;
      const balanceAfterBond = (balanceBigInt - bondBigInt).toString();

      const mockPosition: DisputeWalletPosition = {
        claimId: claimIdParam,
        userAddress: walletAddress,
        canChallenge: true,
        hasParticipatedInFirstRound: false,
        hasOpenedDispute: false,
        currentBalance,
        hasSufficientBalance,
        balanceAfterBond,
      };

      return mockPosition;
    },
    []
  );

  /**
   * Compute eligibility from context components
   */
  const computeEligibility = useCallback(
    (
      outcome: ProvisionalOutcome,
      deadline: DisputeDeadline,
      bond: ChallengeBond,
      position: DisputeWalletPosition,
      walletConnected: boolean,
      correctChain: boolean
    ): { isEligible: boolean; ineligibilityReason?: string } => {
      if (!walletConnected) {
        return {
          isEligible: false,
          ineligibilityReason: 'Wallet not connected',
        };
      }

      if (!correctChain) {
        return {
          isEligible: false,
          ineligibilityReason: `Wrong network. Expected chain ${expectedChainId}`,
        };
      }

      if (!outcome.isProvisional) {
        return {
          isEligible: false,
          ineligibilityReason: 'Outcome already finalized',
        };
      }

      if (!deadline.isWindowOpen) {
        return {
          isEligible: false,
          ineligibilityReason: 'Dispute window has closed',
        };
      }

      if (deadline.hasActiveDispute) {
        return {
          isEligible: false,
          ineligibilityReason: 'Dispute already opened for this claim',
        };
      }

      if (!position.hasSufficientBalance) {
        return {
          isEligible: false,
          ineligibilityReason: `Insufficient balance. Need ${bond.bondAmount} wei`,
        };
      }

      if (position.hasOpenedDispute) {
        return {
          isEligible: false,
          ineligibilityReason: 'You have already opened a dispute for this claim',
        };
      }

      return { isEligible: true };
    },
    [expectedChainId]
  );

  /**
   * Fetch complete dispute context
   */
  const fetchContext = useCallback(async () => {
    if (!enabled) return;
    if (!claimId) {
      setError('Claim ID is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Validate configuration
      if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new Error('Invalid contract address format');
      }

      const currentBlockNum = blockNumber ? Number(blockNumber) : 12345678;

      // Fetch all context components in parallel
      const [outcome, deadline, bond] = await Promise.all([
        fetchProvisionalOutcome(claimId),
        fetchDisputeDeadline(claimId, currentBlockNum),
        fetchChallengeBond(claimId),
      ]);

      // Fetch wallet position (requires bond amount)
      const position = userAddress
        ? await fetchWalletPosition(claimId, bond.bondAmount, userAddress)
        : ({
            claimId,
            userAddress: '',
            canChallenge: false,
            hasParticipatedInFirstRound: false,
            hasOpenedDispute: false,
            currentBalance: '0',
            hasSufficientBalance: false,
            balanceAfterBond: '0',
          } as DisputeWalletPosition);

      // Compute eligibility
      const walletConnected = isConnected && !!userAddress;
      const correctChain = currentChainId === expectedChainId;
      const { isEligible, ineligibilityReason } = computeEligibility(
        outcome,
        deadline,
        bond,
        position,
        walletConnected,
        correctChain
      );

      // Assemble complete context
      const fullContext: DisputeContext = {
        provisionalOutcome: outcome,
        deadline,
        bond,
        walletPosition: position,
        isEligible,
        ineligibilityReason,
      };

      setContext(fullContext);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to fetch dispute context';
      setError(errorMsg);
      setContext(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    enabled,
    claimId,
    contractAddress,
    blockNumber,
    userAddress,
    isConnected,
    currentChainId,
    expectedChainId,
    fetchProvisionalOutcome,
    fetchDisputeDeadline,
    fetchChallengeBond,
    fetchWalletPosition,
    computeEligibility,
  ]);

  // Initial fetch
  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  // Poll for updates
  useEffect(() => {
    if (!enabled || pollInterval <= 0) return;

    const interval = setInterval(() => {
      void fetchContext();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [enabled, pollInterval, fetchContext]);

  // Refetch when block number changes (for deadline updates)
  useEffect(() => {
    if (blockNumber && context) {
      void fetchContext();
    }
  }, [blockNumber]);

  return {
    context,
    isLoading,
    error,
    refetch: fetchContext,
  };
}

/**
 * Utility: Check if claim is eligible for dispute
 */
export function canOpenDispute(context: DisputeContext | null): boolean {
  if (!context) return false;
  return context.isEligible;
}

/**
 * Utility: Get time remaining in dispute window (human-readable)
 */
export function getDisputeTimeRemaining(
  deadline: DisputeDeadline | null
): string {
  if (!deadline || deadline.timeRemaining <= 0) {
    return 'Expired';
  }

  const hours = Math.floor(deadline.timeRemaining / 3600);
  const minutes = Math.floor((deadline.timeRemaining % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
