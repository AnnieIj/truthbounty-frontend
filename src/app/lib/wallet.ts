/**
 * Wallet abstraction layer — V2 EVM stub.
 *
 * V2-FE-009: Removed synthetic hash generation and Stellar dependencies.
 * Real implementations are blocked on V2-FE-003 (contract ABI freeze)
 * and V2-FE-005 (indexer API interface).
 *
 * Callers of claimRewards should migrate to useEvmTransaction + the
 * TruthBounty rewards contract once ABIs are available.
 */

export interface ClaimRewardResult {
  txHash: `0x${string}`;
}

/**
 * NOT IMPLEMENTED — pending V2-FE-003 (contract ABI freeze).
 *
 * Will be replaced with a Wagmi `writeContract` call to the TruthBounty
 * rewards contract's `claim(claimIds)` method.
 *
 * @throws Error always — callers must gate on contract availability.
 */
export async function claimRewards(
  _claimIds: string[],
): Promise<ClaimRewardResult> {
  throw new Error(
    '[claimRewards] Not implemented: waiting for V2-FE-003 contract ABI. ' +
    'Use useEvmTransaction.writeContract once the ABI is available.',
  );
}

/**
 * NOT IMPLEMENTED — pending V2-FE-003.
 *
 * Will be replaced with a Wagmi `readContract` call to the ERC-20
 * TruthBounty token's `balanceOf(address)`.
 *
 * @throws Error always.
 */
export async function getTokenBalance(
  _address?: string,
): Promise<number | bigint> {
  throw new Error(
    '[getTokenBalance] Not implemented: waiting for V2-FE-003 contract ABI.',
  );
}
