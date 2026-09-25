import { useMemo } from 'react';
import { getProtocolVersion } from '@/lib/contracts/registry';

export type ReceiptProjectionStatus =
  | 'idle'
  | 'confirmed'
  | 'rejected'
  | 'stale'
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

    // Fail closed: if no authoritative data is present, remain idle.
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

    // Validate chain consistency
    const chainMismatch =
      typeof expectedChain === 'number' &&
      ((typeof receiptChain === 'number' && receiptChain !== expectedChain) ||
        (typeof projectionChain === 'number' && projectionChain !== expectedChain));

    // Validate contract address consistency
    const contractMismatch =
      typeof contractAddress === 'string' &&
      typeof receipt?.to === 'string' &&
      receipt.to.toLowerCase() !== contractAddress.toLowerCase();

    // Validate claim ID consistency
    const claimMismatch =
      typeof claimId === 'string' &&
      typeof projection?.claimId === 'string' &&
      projection.claimId !== claimId;

    // Validate artifact version consistency
    const versionMismatch =
      typeof artifactVersion === 'string' &&
      typeof projection?.artifactVersion === 'string' &&
      projection.artifactVersion !== artifactVersion;

    // Validate transaction hash consistency
    const hashMismatch =
      typeof receiptHash === 'string' &&
      typeof txHash === 'string' &&
      receiptHash.toLowerCase() !== txHash.toLowerCase();

    const hasReceipt = Boolean(receipt);
    const hasProjection = Boolean(projection);
    const receiptConfirmed = receiptStatus === '0x1' || receiptStatus === 'confirmed' || receiptStatus === 'success';
    const receiptRejected = receiptStatus === '0x0' || receiptStatus === 'reverted' || receiptStatus === 'failed';

    // If any validation fails, fail closed with mismatch
    if (chainMismatch || contractMismatch || claimMismatch || versionMismatch || hashMismatch) {
      return {
        status: 'mismatch' as ReceiptProjectionStatus,
        isMismatch: true,
        isWrongNetwork: chainMismatch,
        isProtocolDisabled: true,
      };
    }

    // If receipt indicates failure, mark as rejected
    if (receiptRejected) {
      return {
        status: 'rejected' as ReceiptProjectionStatus,
        isMismatch: true,
        isWrongNetwork: false,
        isProtocolDisabled: true,
      };
    }

    // If we have a projection but no receipt, it's stale (waiting for on-chain confirmation)
    if (hasProjection && !hasReceipt) {
      return {
        status: 'stale' as ReceiptProjectionStatus,
        isMismatch: true,
        isWrongNetwork: false,
        isProtocolDisabled: true,
      };
    }

    // If we have a receipt but no projection, it's confirmed (awaiting API sync)
    if (hasReceipt && !hasProjection) {
      return {
        status: 'confirmed' as ReceiptProjectionStatus,
        isMismatch: false,
        isWrongNetwork: false,
        isProtocolDisabled: false,
      };
    }

    // If both exist, ensure they align
    if (hasReceipt && hasProjection) {
      // If receipt is confirmed but projection is not, it's a mismatch/stale state
      if (receiptConfirmed && projectionStatus !== 'confirmed') {
        return {
          status: 'stale' as ReceiptProjectionStatus,
          isMismatch: true,
          isWrongNetwork: false,
          isProtocolDisabled: true,
        };
      }

      // If hashes differ, it's a mismatch
      if (projectionHash && receiptHash && projectionHash.toLowerCase() !== receiptHash.toLowerCase()) {
        return {
          status: 'mismatch' as ReceiptProjectionStatus,
          isMismatch: true,
          isWrongNetwork: false,
          isProtocolDisabled: true,
        };
      }

      // If both are confirmed and aligned
      if (receiptConfirmed && projectionStatus === 'confirmed') {
        return {
          status: 'confirmed' as ReceiptProjectionStatus,
          isMismatch: false,
          isWrongNetwork: false,
          isProtocolDisabled: false,
        };
      }
    }

    // Default fallback
    return {
      status: 'idle' as ReceiptProjectionStatus,
      isMismatch: false,
      isWrongNetwork: false,
      isProtocolDisabled: false,
    };
  }, [options]);
}