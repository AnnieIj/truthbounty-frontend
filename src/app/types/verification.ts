export type VerificationDecision = 'VERIFY' | 'REJECT';

export type VerificationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'FAILED';

export interface Verification {
  id: string;

  claimId: string;
  verifierAddress: string;

  decision: VerificationDecision;

  stakeAmount: number;

  status: VerificationStatus;

  transactionHash?: string;

  createdAt: string;
  confirmedAt?: string;
}

// ---------------------------------------------------------------------------
// V2-FE-013 — EVM verification & stake submission types
// ---------------------------------------------------------------------------

/**
 * Canonical True/False verification position encoded on-chain as
 * `VerificationVerdict` (TRUE = 0, FALSE = 1).
 */
export type VerificationPosition = 'TRUE' | 'FALSE';

/**
 * Active verification round parameters for a claim.
 *
 * `minStake` and `deadline` are enforced on-chain by the canonical
 * `VerificationSubmission` contract (V2-SC-010). `maxStake` and
 * `perWalletWeightCap` are protocol parameters published in the versioned
 * deployment release; they are `null` until such a release is pinned so the
 * hook never guesses protocol caps.
 */
export interface VerificationRoundParams {
  /** Active round identifier for the claim (0 when no round is open). */
  roundId: bigint;
  /** Round start time (unix seconds). */
  startTime: bigint;
  /** Verification deadline (unix seconds) — enforced on-chain. */
  deadline: bigint;
  /** Contract-enforced minimum stake (wei). */
  minStake: bigint;
  /** Protocol cap for a single verifier stake (wei); `null` when unpublished. */
  maxStake: bigint | null;
  /** Protocol per-wallet weight cap (wei); `null` when unpublished. */
  perWalletWeightCap: bigint | null;
  /** Protocol parameter version; `null` when unpublished. */
  parameterVersion: bigint | null;
  /** Whether the claim is in an open verification window right now. */
  isOpen: boolean;
}

/**
 * Raw on-chain verification record (`IVerificationSubmission.Verification`).
 * `verdict` is the enum-encoded uint8: 0 = TRUE, 1 = FALSE.
 */
export interface OnChainVerification {
  id: bigint;
  claimId: bigint;
  verifier: `0x${string}`;
  verdict: number;
  stake: bigint;
  submittedAt: bigint;
}

/**
 * Effective on-chain position of a verifier for a claim, derived from the
 * canonical registry without fabricating anything.
 */
export interface EffectiveOnChainPosition {
  claimId: string;
  verifier: `0x${string}` | null;
  exists: boolean;
  position: VerificationPosition | null;
  stake: bigint;
}

/**
 * API projection entity returned by the V2-BE-026 verifications endpoint.
 */
export interface VerificationProjection {
  id: string;
  claimId: string;
  verifierAddress: string;
  decision: VerificationDecision;
  stakeAmount: number;
  status: VerificationStatus;
  transactionHash?: string;
  chainId?: number;
  artifactVersion?: string;
  createdAt: string;
  confirmedAt?: string;
}

/**
 * Phases of the verification submission state machine.
 */
export type VerificationSubmissionPhase =
  | 'idle'
  | 'validating'
  | 'allowance'
  | 'approving'
  | 'simulating'
  | 'confirming'
  | 'reconciling'
  | 'confirmed'
  | 'rejected'
  | 'stale'
  | 'degraded'
  | 'mismatch'
  | 'error';

export interface VerificationReconciliation {
  status: 'confirmed' | 'rejected' | 'stale' | 'degraded' | 'mismatch' | 'idle';
  isMismatch: boolean;
  isWrongNetwork: boolean;
  isProtocolDisabled: boolean;
  details: string[];
}

export type VerificationSubmissionErrorCode =
  | 'UNCONNECTED'
  | 'WRONG_NETWORK'
  | 'PROTOCOL_DISABLED'
  | 'INVALID_CLAIM'
  | 'INVALID_POSITION'
  | 'ALREADY_VERIFIED'
  | 'VERIFICATION_CLOSED'
  | 'STAKE_BELOW_MIN'
  | 'STAKE_ABOVE_MAX'
  | 'DEADLINE_PASSED'
  | 'APPROVAL_REJECTED'
  | 'SIMULATION_REVERTED'
  | 'SUBMISSION_REJECTED'
  | 'RECONCILE_FAILED';

export interface VerificationSubmissionError {
  code: VerificationSubmissionErrorCode;
  message: string;
}

/**
 * Payload posted to the API projection endpoint after on-chain confirmation.
 * Amounts are expressed in whole token units for the API projection and are
 * converted from exact integer (wei) amounts before serialization.
 */
export interface VerificationSubmissionRequest {
  claimId: string;
  verifierAddress: string;
  decision: VerificationDecision;
  stakeAmount: number;
  transactionHash: string;
  chainId: number;
  artifactVersion: string;
  submittedAt: string;
}

export const VERIFICATION_VERDICT = {
  TRUE: 0,
  FALSE: 1,
} as const;

export type VerificationVerdictValue =
  (typeof VERIFICATION_VERDICT)[keyof typeof VERIFICATION_VERDICT];
