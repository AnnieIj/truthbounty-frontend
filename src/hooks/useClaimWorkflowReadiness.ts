import { useMemo } from 'react';
import { useAccount, useChainId, useNetwork } from 'wagmi';
import { OPTIMISM_CHAIN_IDS, isValidChain, TransactionMachineError } from '../lib/transaction-machine';

/**
 * V2-FE-110 — Claim Workflow Readiness Gate
 *
 * Determines if the user's wallet and network configuration allows
 * proceeding with a claim submission.
 *
 * Returns a readiness object containing:
 * - isReady: boolean
 * - error: TransactionMachineError | null
 * - chainId: number | null
 */
export interface ClaimWorkflowReadiness {
  isReady: boolean;
  error: TransactionMachineError | null;
  chainId: number | null;
}

export function useClaimWorkflowReadiness(): ClaimWorkflowReadiness {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { chain } = useNetwork();

  return useMemo(() => {
    // 1. Check Wallet Connection
    if (!isConnected) {
      return {
        isReady: false,
        error: new TransactionMachineError('USER_REJECTED', 'Wallet not connected'),
        chainId: null,
      };
    }

    // 2. Check Address Existence
    if (!address) {
      return {
        isReady: false,
        error: new TransactionMachineError('USER_REJECTED', 'No account address found'),
        chainId: null,
      };
    }

    // 3. Check Chain Validity
    // We use the chainId from wagmi which reflects the currently selected network.
    // We must ensure it is an allowed Optimism chain.
    if (!chainId) {
      return {
        isReady: false,
        error: new TransactionMachineError('WRONG_NETWORK', 'No chain detected'),
        chainId: null,
      };
    }

    if (!isValidChain(chainId)) {
      return {
        isReady: false,
        error: new TransactionMachineError(
          'WRONG_NETWORK',
          `Unsupported chain ID: ${chainId}. Only Optimism Mainnet (${OPTIMISM_CHAIN_IDS[0]}) and OP Sepolia (${OPTIMISM_CHAIN_IDS[1]}) are supported.`
        ),
        chainId,
      };
    }

    // 4. Check Chain Name/ID Consistency (Defense in Depth)
    // Ensure the connected chain object matches the chainId
    if (chain && chain.id !== chainId) {
      return {
        isReady: false,
        error: new TransactionMachineError('WRONG_NETWORK', 'Chain ID mismatch between provider and network config'),
        chainId,
      };
    }

    // All checks passed
    return {
      isReady: true,
      error: null,
      chainId,
    };
  }, [isConnected, address, chainId, chain]);
}