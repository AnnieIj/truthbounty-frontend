import { useMemo } from 'react';
import { getProtocolVersion } from '@/lib/contracts/registry';

export type ReceiptProjectionStatus =
  | 'idle'
  | 'confirmed'
  | 'rejected'
  | 'stale'
  | 'degraded'
  | 'mismatch';

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
  txHash?: string;
  status?: string;
  chainId?: number;
  claimId?: string;
  contractAddress?: string;
  artifactVersion?: string;
}

export interface UseReceiptProjectionOptions {
  txHash?: string;
  chainId?: number;
  contractAddress?: string;
  claimId?: string;
  receipt?: ReceiptLike;
  projection?: ProjectedEntityLike;
  artifactVersion?: string;
}

function normalizeStatus(value?: string): string {
  if (!value) return 'unknown';
  return value.toLowerCase();
}

export function useReceiptProjection(options: UseReceiptProjectionOptions) {
  return useMemo(() => {
    const {
      txHash,
      chainId,
      contractAddress,
      claimId,
      receipt,
      projection,
      artifactVersion: providedArtifactVersion,
    } = options;
    const artifactVersion = providedArtifactVersion ?? getProtocolVersion();

    if (!txHash && !receipt && !projection) {
      return {
        status: 'idle' as ReceiptProjectionStatus,
        isMismatch: false,
        isWrongNetwork: false,
        isProtocolDisabled: false,
      };
    }

    const expectedChain = typeof chainId === 'number' ? chainId : undefined;
    const receiptChain = typeof receipt?.chainId === 'number' ? receipt.chainId : expectedChain;
    const projectionChain = typeof projection?.chainId === 'number' ? projection.chainId : expectedChain;
    const receiptHash = receipt?.transactionHash;
    const projectionHash = projection?.txHash;
    const receiptStatus = normalizeStatus(receipt?.status);
    const projectionStatus = normalizeStatus(projection?.status);

    const chainMismatch =
      typeof expectedChain === 'number' &&
      ((typeof receiptChain === 'number' && receiptChain !== expectedChain) ||
        (typeof projectionChain === 'number' && projectionChain !== expectedChain));

    const contractMismatch =
      typeof contractAddress === 'string' &&
      typeof receipt?.to === 'string' &&
      receipt.to.toLowerCase() !== contractAddress.toLowerCase();

    const claimMismatch =
      typeof claimId === 'string' &&
      typeof projection?.claimId === 'string' &&
      projection.claimId !== claimId;

    const versionMismatch =
      typeof artifactVersion === 'string' &&
      typeof projection?.artifactVersion === 'string' &&
      projection.artifactVersion !== artifactVersion;

    const hashMismatch =
      typeof receiptHash === 'string' &&
      typeof txHash === 'string' &&
      receiptHash.toLowerCase() !== txHash.toLowerCase();

    // Projection must agree with the receipt hash (API lag / reorg guard).
    const projectionReceiptHashMismatch =
      typeof projectionHash === 'string' &&
      typeof receiptHash === 'string' &&
      projectionHash.toLowerCase() !== receiptHash.toLowerCase();

    const hasReceipt = Boolean(receipt);
    const hasProjection = Boolean(projection);
    const receiptConfirmed = receiptStatus === '0x1' || receiptStatus === 'confirmed' || receiptStatus === 'success';
    const receiptRejected = receiptStatus === '0x0' || receiptStatus === 'reverted' || receiptStatus === 'failed';
    const projectionIncomplete =
      hasProjection &&
      (!projection?.status ||
        !projection?.txHash ||
        !projection?.claimId ||
        typeof projection?.chainId !== 'number');

    if (
      chainMismatch ||
      contractMismatch ||
      claimMismatch ||
      versionMismatch ||
      hashMismatch ||
      projectionReceiptHashMismatch
    ) {
      return {
        status: 'mismatch' as ReceiptProjectionStatus,
        isMismatch: true,
        isWrongNetwork: chainMismatch,
        isProtocolDisabled: true,
      };
    }

    if (receiptRejected) {
      return {
        status: 'rejected' as ReceiptProjectionStatus,
        isMismatch: true,
        isWrongNetwork: false,
        isProtocolDisabled: true,
      };
    }

    if (hasProjection && !hasReceipt) {
      return {
        status: 'stale' as ReceiptProjectionStatus,
        isMismatch: true,
        isWrongNetwork: false,
        isProtocolDisabled: true,
      };
    }

    if (hasReceipt && !hasProjection) {
      return {
        status: 'confirmed' as ReceiptProjectionStatus,
        isMismatch: false,
        isWrongNetwork: false,
        isProtocolDisabled: false,
      };
    }

    if (projectionIncomplete && !chainMismatch && !contractMismatch && !claimMismatch && !versionMismatch && !hashMismatch) {
      return {
        status: 'degraded' as ReceiptProjectionStatus,
        isMismatch: false,
        isWrongNetwork: false,
        isProtocolDisabled: false,
      };
    }

    if (hasReceipt && hasProjection && !receiptConfirmed && projectionStatus !== 'confirmed') {
      return {
        status: 'stale' as ReceiptProjectionStatus,
        isMismatch: false,
        isWrongNetwork: false,
        isProtocolDisabled: false,
      };
    }

    if (hasReceipt && hasProjection && receiptConfirmed && projectionStatus === 'confirmed') {
      return {
        status: 'confirmed' as ReceiptProjectionStatus,
        isMismatch: false,
        isWrongNetwork: false,
        isProtocolDisabled: false,
      };
    }

    if (hasReceipt && hasProjection && projectionHash && receiptHash && projectionHash.toLowerCase() !== receiptHash.toLowerCase()) {
      return {
        status: 'mismatch' as ReceiptProjectionStatus,
        isMismatch: true,
        isWrongNetwork: false,
        isProtocolDisabled: true,
      };
    }

    return {
      status: 'idle' as ReceiptProjectionStatus,
      isMismatch: false,
      isWrongNetwork: false,
      isProtocolDisabled: false,
    };
  }, [options]);
}
