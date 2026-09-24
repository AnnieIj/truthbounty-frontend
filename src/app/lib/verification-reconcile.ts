/**
 * V2-FE-013 — Reconciliation of effective on-chain verification state with
 * API projections (V2-BE-026 verifications endpoint).
 *
 * The on-chain receipt and the indexed projection are both authoritative
 * inputs; this module only compares them and never fabricates either side.
 */

'use client';

import {
  EffectiveOnChainPosition,
  VerificationPosition,
  VerificationReconciliation,
  VerificationSubmissionError,
  VerificationSubmissionRequest,
} from '@/app/types/verification';
import { positionToDecision } from '@/lib/verification/encoding';

export interface ReceiptLike {
  transactionHash: string;
  status: '0x1' | '0x0' | string;
  blockNumber?: bigint | number;
  logs?: unknown[];
  from?: string;
  to?: string;
  chainId?: number;
}

export interface ProjectedEntityLike {
  id?: string;
  txHash?: string;
  transactionHash?: string;
  status?: string;
  decision?: string;
  claimId?: string;
  verifierAddress?: string;
  chainId?: number;
  artifactVersion?: string;
}

export interface ReconcileVerificationInput {
  chainId?: number;
  artifactVersion?: string;
  claimId?: string;
  receipt?: ReceiptLike;
  projection?: ProjectedEntityLike;
  onChain?: EffectiveOnChainPosition | null;
  expectedPosition?: VerificationPosition | null;
}

function normalizeStatus(value?: string): string {
  if (!value) return 'unknown';
  return value.toLowerCase();
}

export function reconcileVerificationState(
  input: ReconcileVerificationInput
): VerificationReconciliation {
  const details: string[] = [];
  const { chainId, artifactVersion, claimId, receipt, projection, onChain, expectedPosition } = input;

  const hasReceipt = Boolean(receipt);
  const hasProjection = Boolean(projection);
  const hasOnChain = Boolean(onChain && onChain.exists);
  const projectionIncomplete =
    hasProjection &&
    (!projection?.status ||
      !projection?.txHash && !projection?.transactionHash ||
      !projection?.claimId ||
      typeof projection?.chainId !== 'number');

  if (!hasReceipt && !hasProjection && !hasOnChain) {
    return {
      status: 'idle',
      isMismatch: false,
      isWrongNetwork: false,
      isProtocolDisabled: false,
      details,
    };
  }

  const isWrongNetwork =
    (typeof chainId === 'number' &&
      typeof receipt?.chainId === 'number' &&
      receipt.chainId !== chainId) ||
    (typeof chainId === 'number' &&
      typeof projection?.chainId === 'number' &&
      projection.chainId !== chainId);

  if (isWrongNetwork) {
    details.push('receipt or projection belongs to a different chain');
  }

  const chainMismatch = isWrongNetwork;
  const claimMismatch =
    typeof claimId === 'string' &&
    typeof projection?.claimId === 'string' &&
    projection.claimId !== claimId;
  const versionMismatch =
    typeof artifactVersion === 'string' &&
    typeof projection?.artifactVersion === 'string' &&
    projection.artifactVersion !== artifactVersion;

  const receiptStatus = normalizeStatus(receipt?.status);
  const receiptRejected =
    receiptStatus === '0x0' || receiptStatus === 'reverted' || receiptStatus === 'failed';

  // Projected decision must agree with the effective on-chain position.
  const projectionDecision = projection?.decision;
  const projectionPosition: VerificationPosition | null =
    projectionDecision === 'VERIFY'
      ? 'TRUE'
      : projectionDecision === 'REJECT'
        ? 'FALSE'
        : null;
  const onChainPosition = onChain?.exists ? onChain.position : null;

  const positionMismatch =
    onChainPosition !== null &&
    expectedPosition !== null &&
    expectedPosition !== undefined &&
    onChainPosition !== expectedPosition;
  const projectionMismatch =
    onChainPosition !== null &&
    projectionPosition !== null &&
    onChainPosition !== projectionPosition;

  if (receiptRejected) {
    details.push(`receipt status is ${receiptStatus}`);
    return {
      status: 'rejected',
      isMismatch: true,
      isWrongNetwork,
      isProtocolDisabled: true,
      details,
    };
  }

  if (chainMismatch || claimMismatch || versionMismatch || positionMismatch || projectionMismatch) {
    if (chainMismatch) details.push('chain mismatch');
    if (claimMismatch) details.push('claimId mismatch');
    if (versionMismatch) details.push('artifact version mismatch');
    if (positionMismatch) details.push('on-chain position contradicts expected position');
    if (projectionMismatch) details.push('projection decision contradicts on-chain position');
    return {
      status: 'mismatch',
      isMismatch: true,
      isWrongNetwork,
      isProtocolDisabled: true,
      details,
    };
  }

  const receiptConfirmed =
    receiptStatus === '0x1' || receiptStatus === 'confirmed' || receiptStatus === 'success';

  if (hasOnChain && receiptConfirmed) {
    const projectionConfirmed = normalizeStatus(projection?.status) === 'confirmed';
    if (hasProjection && !projectionConfirmed) {
      if (projectionIncomplete) {
        details.push('projection data is incomplete; API response is degraded');
        return {
          status: 'degraded',
          isMismatch: false,
          isWrongNetwork,
          isProtocolDisabled: false,
          details,
        };
      }
      details.push('projection has not confirmed the on-chain verification');
      return {
        status: 'stale',
        isMismatch: false,
        isWrongNetwork,
        isProtocolDisabled: false,
        details,
      };
    }
    return {
      status: 'confirmed',
      isMismatch: false,
      isWrongNetwork,
      isProtocolDisabled: false,
      details,
    };
  }

  if (projectionIncomplete && !receiptRejected && !chainMismatch && !claimMismatch && !versionMismatch && !positionMismatch && !projectionMismatch) {
    details.push('projection data is incomplete; API response is degraded');
    return {
      status: 'degraded',
      isMismatch: false,
      isWrongNetwork,
      isProtocolDisabled: false,
      details,
    };
  }

  if (hasProjection && !hasOnChain && !receiptRejected) {
    details.push('projection exists but no on-chain position is visible');
    return {
      status: 'stale',
      isMismatch: true,
      isWrongNetwork,
      isProtocolDisabled: false,
      details,
    };
  }

  return {
    status: 'idle',
    isMismatch: false,
    isWrongNetwork,
    isProtocolDisabled: false,
    details,
  };
}

// ---------------------------------------------------------------------------
// API projection adapters (V2-BE-026)
// ---------------------------------------------------------------------------

/**
 * Post the confirmed on-chain submission to the API projection endpoint.
 * `request.stakeAmount` is already expressed in whole token units
 * (see `VerificationSubmissionRequest`), so it is serialized as-is.
 */
export async function submitVerificationProjection(
  request: VerificationSubmissionRequest
): Promise<ProjectedEntityLike> {
  const res = await fetch('/api/verifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      claimId: request.claimId,
      verifierAddress: request.verifierAddress,
      decision: request.decision,
      stakeAmount: request.stakeAmount,
      transactionHash: request.transactionHash,
      chainId: request.chainId,
      artifactVersion: request.artifactVersion,
      submittedAt: request.submittedAt,
    }),
  });

  if (!res.ok) {
    const error: VerificationSubmissionError = {
      code: 'RECONCILE_FAILED',
      message: `API projection rejected the confirmed verification (${res.status})`,
    };
    throw error;
  }
  return res.json();
}

/**
 * Fetch the API projection for a (claimId, verifier) pair, if any.
 * Returns `null` when the projection does not exist yet.
 */
export async function getVerificationProjection(
  claimId: string,
  verifierAddress: string
): Promise<ProjectedEntityLike | null> {
  const query = new URLSearchParams({ claimId, verifierAddress });
  const res = await fetch(`/api/verifications?${query.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('Failed to fetch verification projection');
  }
  return res.json();
}

/**
 * Convenience wrapper combining both adapters: post the projection for the
 * confirmed submission and return the created entity.
 */
export async function reconcileWithProjection(
  request: VerificationSubmissionRequest
): Promise<ProjectedEntityLike> {
  const created = await submitVerificationProjection(request);
  const projection = await getVerificationProjection(
    request.claimId,
    request.verifierAddress
  );
  if (!projection) {
    const error: VerificationSubmissionError = {
      code: 'RECONCILE_FAILED',
      message: 'API projection was not visible after confirmation',
    };
    throw error;
  }
  return {
    ...created,
    ...projection,
    decision: projection.decision ?? positionToDecision(
      request.decision === 'VERIFY' ? 'TRUE' : 'FALSE'
    ) ?? undefined,
  };
}
