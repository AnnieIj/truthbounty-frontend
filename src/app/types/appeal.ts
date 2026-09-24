/**
 * Appeal participation types for V2 protocol
 * Handles appeal verification (second-round voting) distinct from first-round verification
 */

/**
 * Appeal participation decision (similar to verification but in appeal context)
 */
export type AppealDecision = 'SUPPORT' | 'OPPOSE';

/**
 * Appeal participation status
 */
export type AppealParticipationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'REVERTED'
  | 'REPLACED'
  | 'DROPPED'
  | 'STALE'
  | 'FAILED';

/**
 * Appeal state for lifecycle tracking
 */
export type AppealState =
  | 'NOT_STARTED'
  | 'ACTIVE'
  | 'ENDED'
  | 'SETTLED';

/**
 * Appeal snapshot data from contract/indexer
 * Contains immutable state at appeal initiation
 */
export interface AppealSnapshot {
  appealId: string;
  claimId: string;
  disputeId: string;
  
  // Appeal initiator
  initiatorAddress: string;
  initiatorStake: string; // Wei amount as string
  
  // Original verification outcome being appealed
  firstRoundDecision: 'VERIFIED' | 'REJECTED';
  firstRoundVotesFor: number;
  firstRoundVotesAgainst: number;
  
  // Appeal reason
  reason: string;
  
  // Timestamp when appeal was initiated
  initiatedAt: string; // ISO 8601
  blockNumber: number;
}

/**
 * Appeal deadline information
 */
export interface AppealDeadline {
  appealId: string;
  
  // Deadline timestamps
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  
  // Calculated time remaining (in seconds, 0 if expired)
  timeRemaining: number;
  
  // Block-based deadline (for on-chain finality)
  endBlock: number;
  currentBlock: number;
  blocksRemaining: number;
  
  // State flags
  isActive: boolean;
  hasEnded: boolean;
}

/**
 * Stake bounds for appeal participation
 */
export interface AppealStakeBounds {
  appealId: string;
  
  // Minimum stake required to participate
  minStake: string; // Wei amount as string
  
  // Maximum stake allowed (if any)
  maxStake?: string; // Wei amount as string
  
  // Recommended stake (based on existing participation)
  recommendedStake?: string; // Wei amount as string
  
  // Current total staked on each side
  totalSupportStake: string; // Wei amount as string
  totalOpposeStake: string; // Wei amount as string
  
  // Participant counts
  supporterCount: number;
  opposerCount: number;
}

/**
 * User's existing position in the appeal
 */
export interface AppealWalletPosition {
  appealId: string;
  userAddress: string;
  
  // Has user already participated?
  hasParticipated: boolean;
  
  // Existing participation details (if any)
  existingDecision?: AppealDecision;
  existingStake?: string; // Wei amount as string
  participatedAt?: string; // ISO 8601
  transactionHash?: string;
  
  // Wallet balance check
  currentBalance: string; // Wei amount as string
  hasMinimumBalance: boolean;
}

/**
 * Complete appeal participation context
 * Combines snapshot, deadline, bounds, and position
 */
export interface AppealParticipationContext {
  snapshot: AppealSnapshot;
  deadline: AppealDeadline;
  stakeBounds: AppealStakeBounds;
  walletPosition: AppealWalletPosition;
  
  // Computed eligibility
  isEligible: boolean;
  ineligibilityReason?: string;
}

/**
 * Appeal participation submission payload
 */
export interface AppealParticipationPayload {
  appealId: string;
  claimId: string;
  disputeId: string;
  decision: AppealDecision;
  stakeAmount: string; // Wei amount as string
  userAddress: string;
}

/**
 * Appeal participation transaction
 */
export interface AppealParticipationTransaction {
  transactionHash: string;
  from: string;
  to: string; // Contract address
  status: AppealParticipationStatus;

  appealId: string;
  claimId: string;
  disputeId: string;
  decision: AppealDecision;
  stakeAmount: string; // Wei amount as string

  timestamp: string; // ISO 8601
  chainId?: number;

  // On-chain finality (only present once the receipt is confirmed)
  blockNumber?: bigint;
  gasUsed?: bigint;

  // Finality anomalies
  replacedBy?: string; // Replacement transaction hash
  error?: string;
}

/**
 * Simulation result for appeal participation
 *
 * Real eth_call simulation prepared from the canonical ABI. Never
 * fabricates calldata, gas estimates, or projected state. When the
 * canonical ABI does not expose `participateInAppeal`, simulation fails
 * closed with `success: false` and no `data`.
 */
export interface AppealSimulationResult {
  success: boolean;
  error?: string;

  // Real encoded transaction data (only present when simulation succeeded)
  data?: {
    from: string;
    to: string;
    value?: string;
    calldata: `0x${string}`;
  };
}

/**
 * Appeal participation validation result
 */
export interface AppealValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  
  // Validation details
  checks: {
    appealActive: boolean;
    walletConnected: boolean;
    correctChain: boolean;
    supportedChain: boolean;
    sufficientBalance: boolean;
    notAlreadyParticipated: boolean;
    stakeWithinBounds: boolean;
    contractAddressValid: boolean;
    artifactVersionValid: boolean;
    abiFunctionSupported: boolean;
  };
}

/**
 * Lifecycle phase of an appeal participation submission attempt.
 * Every phase maps to a real on-chain or wallet step. No phase is reached
 * merely by guessing; unsupported artifacts fail at `unsupported`.
 */
export type AppealParticipationPhase =
  | 'idle'
  | 'validating'
  | 'allowance'
  | 'approving'
  | 'simulating'
  | 'submitting'
  | 'confirming'
  | 'confirmed'
  | 'rejected'
  | 'reverted'
  | 'replaced'
  | 'dropped'
  | 'stale'
  | 'unsupported'
  | 'error';

/**
 * Machine-readable error codes for appeal participation failures.
 * Thrown as `AppealParticipationError` so callers/tests can match `code`.
 */
export type AppealParticipationErrorCode =
  | 'UNCONNECTED'
  | 'WRONG_NETWORK'
  | 'UNSUPPORTED_CHAIN'
  | 'INVALID_CONTRACT_ADDRESS'
  | 'INVALID_ARTIFACT'
  | 'UNSUPPORTED_ABI'
  | 'APPEAL_CLOSED'
  | 'ALREADY_PARTICIPATED'
  | 'INVALID_STAKE'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_APPEAL_ID'
  | 'APPROVAL_REJECTED'
  | 'ALLOWANCE_INSUFFICIENT'
  | 'SIMULATION_REVERTED'
  | 'USER_REJECTED'
  | 'TRANSACTION_REVERTED'
  | 'TX_DROPPED'
  | 'TX_REPLACED'
  | 'STALE_RECEIPT'
  | 'UNEXPECTED_ERROR';

/**
 * Error thrown by appeal participation flows. Carries a stable
 * machine-readable `code` in addition to the human-readable message.
 */
export class AppealParticipationError extends Error {
  readonly code: AppealParticipationErrorCode;

  constructor(code: AppealParticipationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppealParticipationError';
    this.code = code;
  }
}

/**
 * Appeal reconciliation result after confirmation
 */
export interface AppealReconciliationResult {
  transactionHash: string;
  status: 'confirmed' | 'reverted' | 'timeout';
  
  // Final state after reconciliation
  finalState: AppealState;
  
  // Updated position
  position: AppealWalletPosition;
  
  // Error details (if failed)
  error?: string;
  revertReason?: string;
}

/**
 * State separation marker for first-round vs appeal
 * Ensures appeal participation doesn't interfere with first-round verification state
 */
export interface StateSegregation {
  claimId: string;
  
  // First-round verification state
  firstRoundState: {
    decision?: 'VERIFY' | 'REJECT';
    stakeAmount?: string;
    status?: 'PENDING' | 'CONFIRMED' | 'FAILED';
    transactionHash?: string;
  };
  
  // Appeal participation state (separate)
  appealState: {
    appealId?: string;
    decision?: AppealDecision;
    stakeAmount?: string;
    status?: AppealParticipationStatus;
    transactionHash?: string;
  };
  
  // Flags to prevent confusion
  hasFirstRoundParticipation: boolean;
  hasAppealParticipation: boolean;
  
  // Ensure they're treated independently
  statesAreIndependent: true;
}
