/**
 * V2-FE-059 — Appeal participation transaction encoding and submission.
 *
 * Replaces mock simulation / fabricated tx hashes with Wagmi writeContract +
 * Viem eth_call simulation. Round/bond/deadline changes are driven by
 * canonical on-chain reads; stale-round participation is rejected.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from 'wagmi';
import { maxUint256 } from 'viem';
import {
  AppealDecision,
  AppealParticipationTransaction,
  AppealSimulationResult,
  AppealValidation,
  AppealParticipationContext,
} from '@/app/types/appeal';
import {
  APPEAL_ARTIFACT_VERSION,
  appealErc20Abi,
  appealParticipationAbi,
  getAppealArtifact,
} from '@/config/protocol/appeal-artifact';
import {
  buildAppealRoundProgression,
  checkStaleRound,
  encodeParticipateInAppeal,
  projectStakeTotals,
  toAppealIdBytes32,
  type AppealRoundProgression,
  type OnChainAppealRound,
} from '@/lib/appeal/round-progression';

interface UseAppealParticipationConfig {
  /** Optional override; when omitted the pinned artifact address is used. */
  contractAddress?: string;
  expectedChainId?: number;
  artifactVersion?: string;
  /** Local expected round — must match on-chain or participation fails closed. */
  expectedRound?: number;
}

interface AppealParticipationResult {
  simulateParticipation: (
    context: AppealParticipationContext,
    decision: AppealDecision,
    stakeAmount: string
  ) => Promise<AppealSimulationResult>;

  submitParticipation: (
    context: AppealParticipationContext,
    decision: AppealDecision,
    stakeAmount: string
  ) => Promise<AppealParticipationTransaction>;

  validateParticipation: (
    context: AppealParticipationContext,
    decision: AppealDecision,
    stakeAmount: string
  ) => AppealValidation;

  refreshRoundProgression: (
    appealId: string,
    expectedRound?: number
  ) => Promise<AppealRoundProgression | null>;

  roundProgression: AppealRoundProgression | null;
  artifactDeployed: boolean;
  artifactDisabledReasons: string[];
  isSimulating: boolean;
  isSubmitting: boolean;
  error: string | null;
  lastTransaction: AppealParticipationTransaction | null;
}

const OPTIMISM_MAINNET_CHAIN_ID = 10;

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const candidate = err as { shortMessage?: unknown; message?: unknown };
    if (typeof candidate.shortMessage === 'string') return candidate.shortMessage;
    if (typeof candidate.message === 'string') return candidate.message;
  }
  return 'Transaction failed';
}

function parseRoundTuple(data: unknown): OnChainAppealRound | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown> & { [key: number]: unknown };
  const roundNumber = (row.roundNumber ?? row[0]) as bigint | undefined;
  const requiredBond = (row.requiredBond ?? row[1]) as bigint | undefined;
  const deadline = (row.deadline ?? row[2]) as bigint | undefined;
  const supportStake = (row.supportStake ?? row[3]) as bigint | undefined;
  const opposeStake = (row.opposeStake ?? row[4]) as bigint | undefined;
  const state = (row.state ?? row[5]) as number | bigint | undefined;
  const claimId = (row.claimId ?? row[6]) as `0x${string}` | undefined;
  if (
    typeof roundNumber !== 'bigint' ||
    typeof requiredBond !== 'bigint' ||
    typeof deadline !== 'bigint' ||
    typeof supportStake !== 'bigint' ||
    typeof opposeStake !== 'bigint' ||
    claimId === undefined
  ) {
    return null;
  }
  return {
    roundNumber,
    requiredBond,
    deadline,
    supportStake,
    opposeStake,
    state: typeof state === 'bigint' ? Number(state) : Number(state ?? 0),
    claimId,
  };
}

/**
 * Hook for encoding and submitting appeal participation transactions via
 * Wagmi/Viem. Fail closed on unsupported chain, missing artifact, stale round,
 * or unconfirmed simulation.
 */
export function useAppealParticipation(
  config: UseAppealParticipationConfig = {}
): AppealParticipationResult {
  const {
    contractAddress: contractAddressOverride,
    expectedChainId = OPTIMISM_MAINNET_CHAIN_ID,
    artifactVersion = APPEAL_ARTIFACT_VERSION,
    expectedRound: expectedRoundConfig = 1,
  } = config;

  const { address: userAddress, isConnected } = useAccount();
  const currentChainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const artifact = useMemo(
    () => getAppealArtifact(expectedChainId),
    [expectedChainId]
  );

  const contractAddress =
    contractAddressOverride &&
    /^0x[a-fA-F0-9]{40}$/.test(contractAddressOverride)
      ? (contractAddressOverride.toLowerCase() as `0x${string}`)
      : artifact.isDeployed
        ? artifact.addresses.appealParticipation
        : ('0x0000000000000000000000000000000000000000' as `0x${string}`);

  const [isSimulating, setIsSimulating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTransaction, setLastTransaction] =
    useState<AppealParticipationTransaction | null>(null);
  const [roundProgression, setRoundProgression] =
    useState<AppealRoundProgression | null>(null);

  const refreshRoundProgression = useCallback(
    async (
      appealId: string,
      expectedRound = expectedRoundConfig
    ): Promise<AppealRoundProgression | null> => {
      if (!publicClient || !artifact.isDeployed) {
        setRoundProgression(null);
        return null;
      }
      try {
        const appealIdBytes = toAppealIdBytes32(appealId);
        const raw = await publicClient.readContract({
          address: contractAddress,
          abi: appealParticipationAbi,
          functionName: 'getAppealRound',
          args: [appealIdBytes],
        });
        const round = parseRoundTuple(raw);
        if (!round) {
          setRoundProgression(null);
          return null;
        }
        const progression = buildAppealRoundProgression({
          appealId: appealIdBytes,
          round,
          expectedRound,
        });
        setRoundProgression(progression);
        return progression;
      } catch (err) {
        setError(extractErrorMessage(err));
        setRoundProgression(null);
        return null;
      }
    },
    [
      publicClient,
      artifact.isDeployed,
      contractAddress,
      expectedRoundConfig,
    ]
  );

  const validateParticipation = useCallback(
    (
      context: AppealParticipationContext,
      decision: AppealDecision,
      stakeAmount: string
    ): AppealValidation => {
      const errors: string[] = [];
      const warnings: string[] = [];

      const appealActive =
        context.deadline.isActive && !context.deadline.hasEnded;
      if (!appealActive) {
        errors.push('Appeal period has ended or has not started');
      }

      const walletConnected = isConnected && !!userAddress;
      if (!walletConnected) {
        errors.push('Wallet not connected');
      }

      const correctChain = currentChainId === expectedChainId;
      if (!correctChain) {
        errors.push(
          `Wrong network. Expected chain ${expectedChainId}, got ${currentChainId}`
        );
      }

      const contractAddressValid =
        contractAddress.match(/^0x[a-fA-F0-9]{40}$/) !== null &&
        contractAddress !== '0x0000000000000000000000000000000000000000';
      if (!contractAddressValid) {
        errors.push('Invalid contract address format');
      }

      const artifactVersionValid =
        artifactVersion === APPEAL_ARTIFACT_VERSION &&
        (artifact.isDeployed || Boolean(contractAddressOverride));
      if (!artifactVersionValid) {
        errors.push(
          `Contract version mismatch or protocol not deployed. Expected ${APPEAL_ARTIFACT_VERSION}`
        );
        if (artifact.disabledReasons.length > 0) {
          errors.push(...artifact.disabledReasons);
        }
      }

      const notAlreadyParticipated = !context.walletPosition.hasParticipated;
      if (!notAlreadyParticipated) {
        errors.push('You have already participated in this appeal');
      }

      const expectedRound =
        context.roundProgression?.expectedRound ??
        context.roundProgression?.roundNumber ??
        expectedRoundConfig;
      const onChainRound =
        context.roundProgression?.roundNumber ?? expectedRound;
      const stale = checkStaleRound(onChainRound, expectedRound);
      const roundCurrent = !stale.isStale;
      if (!roundCurrent) {
        errors.push(
          stale.reason ??
            'Stale round — appeal escalated; refresh before participating'
        );
      }

      let sufficientBalance = false;
      let stakeWithinBounds = false;

      try {
        const stakeBigInt = BigInt(stakeAmount);
        const minStakeBigInt = BigInt(context.stakeBounds.minStake);
        const maxStakeBigInt = context.stakeBounds.maxStake
          ? BigInt(context.stakeBounds.maxStake)
          : maxUint256;
        const balanceBigInt = BigInt(context.walletPosition.currentBalance);

        sufficientBalance = balanceBigInt >= stakeBigInt;
        if (!sufficientBalance) {
          errors.push('Insufficient balance for stake amount');
        }

        stakeWithinBounds =
          stakeBigInt >= minStakeBigInt && stakeBigInt <= maxStakeBigInt;
        if (stakeBigInt < minStakeBigInt) {
          errors.push(
            `Stake amount below minimum of ${context.stakeBounds.minStake} wei`
          );
        }
        if (stakeBigInt > maxStakeBigInt) {
          errors.push(
            `Stake amount exceeds maximum of ${context.stakeBounds.maxStake} wei`
          );
        }

        if (context.stakeBounds.recommendedStake) {
          const recommendedBigInt = BigInt(
            context.stakeBounds.recommendedStake
          );
          if (stakeBigInt < recommendedBigInt / BigInt(2)) {
            warnings.push(
              'Stake amount is significantly below recommended amount'
            );
          }
        }

        const requiredBond = context.roundProgression?.requiredBond
          ? BigInt(context.roundProgression.requiredBond)
          : null;
        if (requiredBond !== null && stakeBigInt < requiredBond) {
          errors.push(
            `Stake amount below required bond of ${requiredBond.toString()} wei`
          );
          stakeWithinBounds = false;
        }
      } catch {
        errors.push('Invalid stake amount format');
      }

      if (decision !== 'SUPPORT' && decision !== 'OPPOSE') {
        errors.push('Invalid decision. Must be SUPPORT or OPPOSE');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        checks: {
          appealActive,
          walletConnected,
          correctChain,
          sufficientBalance,
          notAlreadyParticipated,
          stakeWithinBounds,
          contractAddressValid,
          artifactVersionValid,
          roundCurrent,
        },
      };
    },
    [
      isConnected,
      userAddress,
      currentChainId,
      expectedChainId,
      contractAddress,
      artifactVersion,
      artifact.isDeployed,
      artifact.disabledReasons,
      contractAddressOverride,
      expectedRoundConfig,
    ]
  );

  const simulateParticipation = useCallback(
    async (
      context: AppealParticipationContext,
      decision: AppealDecision,
      stakeAmount: string
    ): Promise<AppealSimulationResult> => {
      setIsSimulating(true);
      setError(null);

      try {
        const validation = validateParticipation(
          context,
          decision,
          stakeAmount
        );
        if (!validation.isValid) {
          return {
            success: false,
            error: validation.errors.join('; '),
          };
        }

        if (!publicClient) {
          return {
            success: false,
            error: 'Public client unavailable — cannot simulate',
          };
        }

        if (!userAddress) {
          return { success: false, error: 'Wallet not connected' };
        }

        const appealIdBytes = toAppealIdBytes32(context.snapshot.appealId);
        const expectedRound = BigInt(
          context.roundProgression?.expectedRound ??
            context.roundProgression?.roundNumber ??
            expectedRoundConfig
        );
        const stakeBigInt = BigInt(stakeAmount);

        // Refresh canonical round before eth_call — fail closed on drift.
        let supportTotal = BigInt(context.stakeBounds.totalSupportStake);
        let opposeTotal = BigInt(context.stakeBounds.totalOpposeStake);
        try {
          const raw = await publicClient.readContract({
            address: contractAddress,
            abi: appealParticipationAbi,
            functionName: 'getAppealRound',
            args: [appealIdBytes],
          });
          const round = parseRoundTuple(raw);
          if (round) {
            const stale = checkStaleRound(round.roundNumber, expectedRound);
            if (stale.isStale) {
              return {
                success: false,
                error:
                  stale.reason ??
                  'Stale round — cannot simulate participation',
              };
            }
            supportTotal = round.supportStake;
            opposeTotal = round.opposeStake;
            setRoundProgression(
              buildAppealRoundProgression({
                appealId: appealIdBytes,
                round,
                expectedRound: Number(expectedRound),
              })
            );
          }
        } catch (err) {
          return {
            success: false,
            error: `Failed to read appeal round: ${extractErrorMessage(err)}`,
          };
        }

        const encoded = encodeParticipateInAppeal({
          appealId: appealIdBytes,
          decision,
          stakeAmount: stakeBigInt,
          expectedRound,
        });

        let gasEstimate: string | undefined;
        try {
          await publicClient.simulateContract({
            address: contractAddress,
            abi: appealParticipationAbi,
            functionName: 'participateInAppeal',
            args: encoded.args,
            account: userAddress as `0x${string}`,
          });
          if (typeof publicClient.estimateContractGas === 'function') {
            const gas = await publicClient.estimateContractGas({
              address: contractAddress,
              abi: appealParticipationAbi,
              functionName: 'participateInAppeal',
              args: encoded.args,
              account: userAddress as `0x${string}`,
            });
            gasEstimate = gas.toString();
          }
        } catch (err) {
          return {
            success: false,
            error: extractErrorMessage(err),
          };
        }

        const projected = projectStakeTotals({
          decision,
          stakeAmount: stakeBigInt,
          currentSupport: supportTotal,
          currentOppose: opposeTotal,
        });

        return {
          success: true,
          gasEstimate,
          projectedState: {
            newSupportTotal: projected.newSupportTotal,
            newOpposeTotal: projected.newOpposeTotal,
            riskAmount: projected.riskAmount,
            // potentialReward intentionally omitted — never fabricate rewards
          },
          data: {
            from: userAddress,
            to: contractAddress,
            value: '0',
            calldata: encoded.calldata,
          },
        };
      } catch (err) {
        const errorMsg = extractErrorMessage(err);
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsSimulating(false);
      }
    },
    [
      validateParticipation,
      publicClient,
      userAddress,
      contractAddress,
      expectedRoundConfig,
    ]
  );

  const submitParticipation = useCallback(
    async (
      context: AppealParticipationContext,
      decision: AppealDecision,
      stakeAmount: string
    ): Promise<AppealParticipationTransaction> => {
      setIsSubmitting(true);
      setError(null);

      try {
        const validation = validateParticipation(
          context,
          decision,
          stakeAmount
        );
        if (!validation.isValid) {
          throw new Error(validation.errors.join('; '));
        }

        const simulation = await simulateParticipation(
          context,
          decision,
          stakeAmount
        );
        if (!simulation.success) {
          throw new Error(simulation.error || 'Simulation failed');
        }

        if (!userAddress) {
          throw new Error('Wallet not connected');
        }

        const appealIdBytes = toAppealIdBytes32(context.snapshot.appealId);
        const expectedRound = BigInt(
          context.roundProgression?.expectedRound ??
            context.roundProgression?.roundNumber ??
            expectedRoundConfig
        );
        const stakeBigInt = BigInt(stakeAmount);
        const encoded = encodeParticipateInAppeal({
          appealId: appealIdBytes,
          decision,
          stakeAmount: stakeBigInt,
          expectedRound,
        });

        // Ensure ERC-20 allowance when staking token is pinned.
        if (artifact.isDeployed && publicClient) {
          try {
            const allowance = (await publicClient.readContract({
              address: artifact.addresses.stakingToken,
              abi: appealErc20Abi,
              functionName: 'allowance',
              args: [userAddress as `0x${string}`, contractAddress],
            })) as bigint;
            if (allowance < stakeBigInt) {
              const approveHash = await writeContractAsync({
                address: artifact.addresses.stakingToken,
                abi: appealErc20Abi,
                functionName: 'approve',
                args: [contractAddress, maxUint256],
              } as never);
              // Wait for the approval receipt when the client can confirm it.
              if (publicClient.getTransactionReceipt) {
                const start = Date.now();
                while (Date.now() - start < 120_000) {
                  try {
                    const receipt = await publicClient.getTransactionReceipt({
                      hash: approveHash as `0x${string}`,
                    });
                    if (receipt) break;
                  } catch {
                    // not mined yet
                  }
                  await new Promise((r) => setTimeout(r, 1_500));
                }
              }
            }
          } catch (err) {
            throw new Error(
              `Token allowance check/approve failed: ${extractErrorMessage(err)}`
            );
          }
        }

        const txHash = await writeContractAsync({
          address: contractAddress,
          abi: appealParticipationAbi,
          functionName: 'participateInAppeal',
          args: encoded.args,
        } as never);

        if (
          typeof txHash !== 'string' ||
          !/^0x[a-fA-F0-9]{64}$/.test(txHash)
        ) {
          throw new Error(
            'Wallet did not return a canonical transaction hash'
          );
        }

        const timestamp = new Date().toISOString();
        const transaction: AppealParticipationTransaction = {
          transactionHash: txHash,
          from: userAddress,
          to: contractAddress,
          status: 'PENDING',
          appealId: context.snapshot.appealId,
          claimId: context.snapshot.claimId,
          disputeId: context.snapshot.disputeId,
          decision,
          stakeAmount,
          timestamp,
          expectedRound: Number(expectedRound),
        };

        setLastTransaction(transaction);
        return transaction;
      } catch (err) {
        const errorMsg = extractErrorMessage(err);
        setError(errorMsg);
        throw err instanceof Error ? err : new Error(errorMsg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      validateParticipation,
      simulateParticipation,
      userAddress,
      expectedRoundConfig,
      artifact.isDeployed,
      artifact.addresses.stakingToken,
      publicClient,
      writeContractAsync,
      contractAddress,
    ]
  );

  return {
    simulateParticipation,
    submitParticipation,
    validateParticipation,
    refreshRoundProgression,
    roundProgression,
    artifactDeployed: artifact.isDeployed,
    artifactDisabledReasons: artifact.disabledReasons,
    isSimulating,
    isSubmitting,
    error,
    lastTransaction,
  };
}
