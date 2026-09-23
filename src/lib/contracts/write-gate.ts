/**
 * V2-FE-100 — Wallet and Transaction Readiness Gate
 *
 * Pure fail-closed evaluator for write readiness. No React, no wallet SDKs.
 * Every mutation path must pass this gate before PREPARE/signature.
 *
 * Security invariants:
 *  - Fail closed on missing config, wrong chain, invalid/placeholder address
 *  - Never fabricate calldata, gas, tx hashes, receipts, or protocol outcomes
 *  - Optimism/EVM only (OP Mainnet + OP Sepolia; local dev optional)
 */

import { getAddressValidationError, isValidContractAddress } from './address-guard';
import { getContractAddress, getReleaseChainId } from './registry';
import {
  OPTIMISM_CHAIN_IDS,
  isValidChain,
} from '@/lib/transaction-machine/transaction-machine.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WriteGateFailureCode =
  | 'WALLET_DISCONNECTED'
  | 'CHAIN_UNSUPPORTED'
  | 'WRONG_CHAIN'
  | 'MISSING_MANIFEST'
  | 'WRONG_ADDRESS'
  | 'PLACEHOLDER_ADDRESS'
  | 'ALLOWANCE_UNKNOWN'
  | 'ALLOWANCE_INSUFFICIENT'
  | 'SIMULATION_REQUIRED'
  | 'SIMULATION_FAILED'
  | 'RECEIPT_PENDING'
  | 'RECEIPT_REVERTED'
  | 'STALE_ARTIFACT'
  | 'READINESS_UNCERTAIN';

export interface WriteGateFailure {
  readonly code: WriteGateFailureCode;
  readonly message: string;
  /** When true, the UI must block the action (fail closed). */
  readonly blocking: true;
}

export interface WriteGateInput {
  /** Connected account; undefined when disconnected. */
  readonly account?: string | null;
  /** Wallet chain id; undefined when unknown. */
  readonly chainId?: number | null;
  /** Expected protocol chain id (release manifest preferred). */
  readonly expectedChainId?: number;
  /** Target contract address (canonical release address preferred). */
  readonly targetAddress?: string | null;
  /** ERC-20 allowance for the spender, when required by the action. */
  readonly allowance?: {
    readonly required: bigint;
    readonly approved: bigint | null;
  } | null;
  /** Simulation outcome, when the action requires a pre-send simulation. */
  readonly simulation?: {
    readonly status: 'not-required' | 'pending' | 'passed' | 'failed';
    readonly error?: string;
  } | null;
  /** Receipt for an in-flight or completed write, when tracked. */
  readonly receipt?: {
    readonly status: 'pending' | 'success' | 'reverted';
  } | null;
  /** Permit Hardhat/Anvil chain 31337 (tests and local development only). */
  readonly allowLocalDev?: boolean;
  /**
   * When true, targetAddress must equal the canonical release contract.
   * Off by default so token/approve targets and unit fixtures are allowed;
   * set for protocol mutation paths that must hit TruthBountyWeighted.
   */
  readonly requireCanonicalMatch?: boolean;
}

export interface WriteGateResult {
  readonly ready: boolean;
  readonly failures: readonly WriteGateFailure[];
  /** Primary human-readable reason when not ready. */
  readonly reason: string | null;
}

export class WriteGateError extends Error {
  readonly failures: readonly WriteGateFailure[];

  constructor(failures: readonly WriteGateFailure[]) {
    const primary = failures[0];
    super(
      primary
        ? `[WriteGate] ${primary.code}: ${primary.message}`
        : '[WriteGate] READINESS_UNCERTAIN: write readiness could not be established',
    );
    this.name = 'WriteGateError';
    this.failures = failures;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(code: WriteGateFailureCode, message: string): WriteGateFailure {
  return { code, message, blocking: true };
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Resolve the canonical release contract address, or null if unavailable. */
export function resolveCanonicalTargetAddress(): string | null {
  try {
    return getContractAddress('TruthBountyWeighted');
  } catch {
    return null;
  }
}

/** Resolve the release chain id, or null if the manifest is incomplete. */
export function resolveExpectedChainId(): number | null {
  try {
    const chainId = getReleaseChainId();
    return typeof chainId === 'number' && Number.isFinite(chainId) ? chainId : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate write readiness. Fail closed: any blocking failure ⇒ not ready.
 * Pure — safe to unit-test and call from hooks or reducers.
 */
export function evaluateWriteTarget(input: WriteGateInput): WriteGateResult {
  const failures: WriteGateFailure[] = [];

  const expectedChainId =
    input.expectedChainId !== undefined && input.expectedChainId !== null
      ? input.expectedChainId
      : (resolveExpectedChainId() ?? OPTIMISM_CHAIN_IDS[0]);

  // 1) Wallet must be connected with an address
  if (!input.account) {
    failures.push(fail('WALLET_DISCONNECTED', 'Connect a wallet to continue.'));
  } else if (!isValidContractAddress(input.account)) {
    // Reuse address-guard for account format / placeholder detection
    const detail = getAddressValidationError(input.account) ?? 'invalid account address';
    failures.push(
      fail('PLACEHOLDER_ADDRESS', `Connected account is not a canonical EVM address: ${detail}`),
    );
  }

  // 2) Chain must be known, on Optimism, and match the expected protocol chain
  if (input.chainId === undefined || input.chainId === null) {
    failures.push(
      fail('CHAIN_UNSUPPORTED', 'Wallet network is unknown. Reconnect and try again.'),
    );
  } else if (!isValidChain(input.chainId, input.allowLocalDev === true)) {
    failures.push(
      fail(
        'CHAIN_UNSUPPORTED',
        `Unsupported network (chain ${input.chainId}). Use Optimism Mainnet or OP Sepolia.`,
      ),
    );
  } else if (
    input.chainId !== expectedChainId &&
    !(input.allowLocalDev === true && input.chainId === 31337)
  ) {
    failures.push(
      fail(
        'WRONG_CHAIN',
        `Wrong network: connected to chain ${input.chainId}, expected ${expectedChainId}.`,
      ),
    );
  }

  // 3) Target address must be present and canonical; optionally match release artifact
  if (input.targetAddress === undefined || input.targetAddress === null || input.targetAddress === '') {
    failures.push(fail('MISSING_MANIFEST', 'Contract address is missing from release artifacts.'));
  } else {
    const addressError = getAddressValidationError(input.targetAddress);
    if (addressError) {
      const isPlaceholder =
        /placeholder|dummy|mock|yourcontract|testaddress/i.test(addressError) ||
        /^0x0+$/i.test(String(input.targetAddress).trim());
      failures.push(
        fail(
          isPlaceholder ? 'PLACEHOLDER_ADDRESS' : 'WRONG_ADDRESS',
          `Invalid contract address: ${addressError}`,
        ),
      );
    } else {
      const canonical = resolveCanonicalTargetAddress();
      if (input.requireCanonicalMatch === true && canonical && !sameAddress(canonical, input.targetAddress)) {
        failures.push(
          fail(
            'WRONG_ADDRESS',
            'Target address does not match the canonical release artifact.',
          ),
        );
      }
    }
  }

  // 4) Allowance — unknown or insufficient fails closed when a requirement is declared
  if (input.allowance) {
    if (input.allowance.approved === null || input.allowance.approved === undefined) {
      failures.push(
        fail('ALLOWANCE_UNKNOWN', 'Token allowance could not be verified.'),
      );
    } else if (input.allowance.approved < input.allowance.required) {
      failures.push(
        fail(
          'ALLOWANCE_INSUFFICIENT',
          'Insufficient token allowance. Approve the required amount first.',
        ),
      );
    }
  }

  // 5) Simulation — pending/failed blocks; passed/not-required proceed
  if (input.simulation && input.simulation.status !== 'not-required' && input.simulation.status !== 'passed') {
    if (input.simulation.status === 'pending') {
      failures.push(
        fail('SIMULATION_REQUIRED', 'Transaction simulation is still running.'),
      );
    } else {
      failures.push(
        fail(
          'SIMULATION_FAILED',
          input.simulation.error || 'Transaction simulation failed.',
        ),
      );
    }
  }

  // 6) Receipt — only success clears a tracked write; pending/reverted block success UI
  if (input.receipt) {
    if (input.receipt.status === 'pending') {
      failures.push(
        fail('RECEIPT_PENDING', 'Waiting for transaction confirmation.'),
      );
    } else if (input.receipt.status === 'reverted') {
      failures.push(
        fail('RECEIPT_REVERTED', 'Transaction reverted on-chain. No protocol change was applied.'),
      );
    }
  }

  const ready = failures.length === 0;
  return {
    ready,
    failures,
    reason: ready ? null : (failures[0]?.message ?? 'Write readiness could not be established.'),
  };
}

/**
 * Assert readiness or throw WriteGateError. Call immediately before PREPARE.
 */
export function assertWriteReady(input: WriteGateInput): asserts input is WriteGateInput {
  const result = evaluateWriteTarget(input);
  if (!result.ready) {
    throw new WriteGateError(result.failures);
  }
}

/**
 * Map a gate failure to a machine-level reason for TransactionMachineError.
 */
export function mapGateFailureToMachineReason(
  failure: WriteGateFailure,
): 'WRONG_NETWORK' | 'INVALID_TRANSITION' {
  if (failure.code === 'WRONG_CHAIN' || failure.code === 'CHAIN_UNSUPPORTED') {
    return 'WRONG_NETWORK';
  }
  return 'INVALID_TRANSITION';
}
