/**
 * V2-FE-009 — Shared Transaction State Machine
 * Pure reducer: transitionTxState(current, event) → next
 *
 * Design invariants:
 *  - No side-effects, no I/O, no randomness
 *  - Every returned state is a new object (immutable transitions)
 *  - Illegal transitions throw TransactionMachineError('INVALID_TRANSITION')
 *  - All 11 states × all events are handled explicitly — TypeScript `never` enforces exhaustiveness
 */

import {
  TransactionState,
  TransactionEvent,
  TransactionMachineError,
  TxStateIdle,
  TxStatePreparing,
  TxStateSignatureRequested,
  TxStateSubmitted,
  TxStateConfirming,
  TxStateSafe,
  TxStateIndexing,
  TxStateReorged,
  createIdleState,
  isValidChain,
} from "./transaction-machine.types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function illegal(from: string, event: string): never {
  throw new TransactionMachineError(
    "INVALID_TRANSITION",
    `${from} + ${event} is not a legal transition`,
  );
}

// ---------------------------------------------------------------------------
// Per-state handlers
// ---------------------------------------------------------------------------

function fromIdle(
  state: TxStateIdle,
  event: TransactionEvent,
  allowLocalDev: boolean,
): TransactionState {
  switch (event.type) {
    case "PREPARE": {
      if (!isValidChain(event.chainId, allowLocalDev)) {
        throw new TransactionMachineError(
          "WRONG_NETWORK",
          `chainId ${event.chainId} is not an allowed Optimism chain`,
        );
      }
      const next: TxStatePreparing = {
        status: "preparing",
        txHash: null,
        chainId: event.chainId,
        blockNumber: null,
        confirmations: null,
        error: null,
        replacedBy: null,
      };
      return next;
    }
    case "RESET":
      return createIdleState();
    // Allow RETRY on idle (no-op)
    case "RETRY":
      return createIdleState();
    default:
      return illegal("idle", event.type);
  }
}

function fromPreparing(
  state: TxStatePreparing,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "REQUEST_SIGNATURE": {
      const next: TxStateSignatureRequested = {
        status: "signature-requested",
        txHash: null,
        chainId: state.chainId,
        blockNumber: null,
        confirmations: null,
        error: null,
        replacedBy: null,
      };
      return next;
    }
    case "RESET":
      return createIdleState();
    case "USER_REJECTED":
      // Quietly cancel back to idle without persisting an error
      return createIdleState();
    default:
      return illegal("preparing", event.type);
  }
}

function fromSignatureRequested(
  state: TxStateSignatureRequested,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "SUBMIT": {
      const next: TxStateSubmitted = {
        status: "submitted",
        txHash: event.txHash,
        chainId: state.chainId,
        blockNumber: null,
        confirmations: null,
        error: null,
        replacedBy: null,
      };
      return next;
    }
    case "USER_REJECTED":
      return createIdleState();
    case "RESET":
      return createIdleState();
    default:
      return illegal("signature-requested", event.type);
  }
}

function fromSubmitted(
  state: TxStateSubmitted,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "CONFIRM": {
      // Guard: receipt chainId must match the chain we submitted on
      if (event.receiptChainId !== state.chainId) {
        throw new TransactionMachineError(
          "STALE_RECEIPT",
          `receipt chainId ${event.receiptChainId} ≠ submission chainId ${state.chainId}`,
        );
      }
      const next: TxStateConfirming = {
        status: "confirming",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: event.blockNumber,
        confirmations: event.confirmations,
        error: null,
        replacedBy: null,
      };
      return next;
    }
    case "DROP":
      return {
        status: "dropped",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: null,
        confirmations: null,
        error: "DROPPED",
        replacedBy: null,
      };
    case "REPLACE":
      return {
        status: "replaced",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: null,
        confirmations: null,
        error: null,
        replacedBy: event.replacedBy,
      };
    case "RESET":
      return createIdleState();
    default:
      return illegal("submitted", event.type);
  }
}

function fromConfirming(
  state: TxStateConfirming,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "CONFIRM": {
      // Update confirmation count; keep confirming
      if (event.receiptChainId !== state.chainId) {
        throw new TransactionMachineError(
          "STALE_RECEIPT",
          `receipt chainId ${event.receiptChainId} ≠ ${state.chainId}`,
        );
      }
      return {
        ...state,
        blockNumber: event.blockNumber,
        confirmations: event.confirmations,
      };
    }
    case "MARK_SAFE": {
      const next: TxStateSafe = {
        status: "safe",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: state.blockNumber,
        confirmations: state.confirmations,
        error: null,
        replacedBy: null,
      };
      return next;
    }
    case "REVERT":
      return {
        status: "reverted",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: state.blockNumber,
        confirmations: null,
        error: "REVERT",
        replacedBy: null,
      };
    case "REORG": {
      const next: TxStateReorged = {
        status: "reorged",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: state.blockNumber,
        confirmations: null,
        error: "REORG",
        replacedBy: null,
      };
      return next;
    }
    case "REPLACE":
      return {
        status: "replaced",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: null,
        confirmations: null,
        error: null,
        replacedBy: event.replacedBy,
      };
    case "RESET":
      return createIdleState();
    default:
      return illegal("confirming", event.type);
  }
}

function fromSafe(
  state: TxStateSafe,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "REORG": {
      const next: TxStateReorged = {
        status: "reorged",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: state.blockNumber,
        confirmations: null,
        error: "REORG",
        replacedBy: null,
      };
      return next;
    }
    case "INDEXING": {
      const next: TxStateIndexing = {
        status: "indexing",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: state.blockNumber,
        confirmations: state.confirmations,
        error: null,
        replacedBy: null,
      };
      return next;
    }
    case "FINALIZE":
      // Direct safe → finalized (no indexing step configured)
      return {
        status: "finalized",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: state.blockNumber,
        confirmations: state.confirmations,
        error: null,
        replacedBy: null,
      };
    case "RESET":
      return createIdleState();
    default:
      return illegal("safe", event.type);
  }
}

function fromIndexing(
  state: TxStateIndexing,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "FINALIZE":
      return {
        status: "finalized",
        txHash: state.txHash,
        chainId: state.chainId,
        blockNumber: state.blockNumber,
        confirmations: state.confirmations,
        error: null,
        replacedBy: null,
      };
    case "RESET":
      return createIdleState();
    default:
      return illegal("indexing", event.type);
  }
}

// Terminal states — only RETRY / RESET are accepted

function fromTerminalFailure(
  state: TransactionState,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "RETRY":
    case "RESET":
      return createIdleState();
    default:
      return illegal(state.status, event.type);
  }
}

function fromFinalized(
  state: TransactionState,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "RESET":
      return createIdleState();
    default:
      return illegal("finalized", event.type);
  }
}

// ---------------------------------------------------------------------------
// Main reducer
// ---------------------------------------------------------------------------

/**
 * Pure state transition function.
 *
 * @param current - Current transaction state
 * @param event   - Incoming event
 * @param opts.allowLocalDev - Allow Hardhat chain ID 31337 (default: false)
 * @returns Next transaction state (always a new object)
 * @throws TransactionMachineError on invalid transitions or security violations
 */
export function transitionTxState(
  current: TransactionState,
  event: TransactionEvent,
  opts: { allowLocalDev?: boolean } = {},
): TransactionState {
  const allowLocalDev = opts.allowLocalDev ?? false;

  switch (current.status) {
    case "idle":
      return fromIdle(current, event, allowLocalDev);
    case "preparing":
      return fromPreparing(current, event);
    case "signature-requested":
      return fromSignatureRequested(current, event);
    case "submitted":
      return fromSubmitted(current, event);
    case "confirming":
      return fromConfirming(current, event);
    case "safe":
      return fromSafe(current, event);
    case "indexing":
      return fromIndexing(current, event);
    case "finalized":
      return fromFinalized(current, event);
    case "dropped":
    case "replaced":
    case "reverted":
    case "reorged":
      return fromTerminalFailure(current, event);
    default: {
      // Exhaustiveness check — TypeScript will error here if a state is missing
      const _exhaustive: never = current;
      throw new TransactionMachineError(
        "INVALID_TRANSITION",
        `Unknown state: ${(_exhaustive as TransactionState).status}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// V2-FE-011 — Claim Creation Transaction Hook
// ---------------------------------------------------------------------------

export type ClaimCreationErrorCode =
  | "INVALID_CHAIN"
  | "INVALID_WALLET_ACCOUNT"
  | "INVALID_ARTIFACT_VERSION"
  | "INVALID_CONTENT_DIGEST"
  | "INVALID_BOUNTY_ASSET"
  | "INVALID_BOUNTY_AMOUNT"
  | "INVALID_FROZEN_CONFIG"
  | "USER_REJECTED"
  | "ALLOWANCE_INSUFFICIENT"
  | "SIMULATION_REVERTED"
  | "TRANSACTION_REVERTED"
  | "CLAIM_NOT_INDEXED"
  | "STALE_RECONCILIATION"
  | "STALE_RECEIPT";

export class ClaimCreationError extends Error {
  readonly code: ClaimCreationErrorCode;

  constructor(code: ClaimCreationErrorCode, message: string) {
    super(message);
    this.name = "ClaimCreationError";
    this.code = code;
  }
}

export type ClaimCreationAddress = `0x${string}`;
export type ClaimCreationHash = `0x${string}`;

export interface ClaimCreationInput {
  chainId: number;
  walletAccount: ClaimCreationAddress;
  artifactVersion: string;
  contentDigest: ClaimCreationHash;
  bountyAsset: ClaimCreationAddress;
  bountyAmount: bigint;
  frozenConfig: Readonly<Record<string, unknown>>;
}

export interface ClaimCreationCall {
  to: ClaimCreationAddress;
  data: ClaimCreationHash;
  value: bigint;
}

export interface ClaimCreationIndexedClaim {
  id: string;
  txHash: ClaimCreationHash;
  contentDigest: ClaimCreationHash;
}

export interface ClaimCreationAdapters {
  encodeClaimCall(input: ClaimCreationInput): ClaimCreationCall;
  getAllowance(
    input: ClaimCreationInput,
    call: ClaimCreationCall,
  ): Promise<bigint>;
  simulate(
    input: ClaimCreationInput,
    call: ClaimCreationCall,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  submit(
    input: ClaimCreationInput,
    call: ClaimCreationCall,
  ): Promise<ClaimCreationHash>;
  waitForConfirmation(
    txHash: ClaimCreationHash,
    chainId: number,
  ): Promise<{
    status: "success" | "reverted";
    chainId: number;
    blockNumber: number;
    confirmations: number;
  }>;
  getIndexedClaim(
    txHash: ClaimCreationHash,
    contentDigest: ClaimCreationHash,
  ): Promise<ClaimCreationIndexedClaim | null>;
}

function isHexAddress(value: string): value is ClaimCreationAddress {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isBytes32(value: string): value is ClaimCreationHash {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export function validateClaimCreationInput(
  input: ClaimCreationInput,
  opts: { allowLocalDev?: boolean; supportedArtifactVersion: string },
): ClaimCreationInput {
  const allowLocalDev = opts.allowLocalDev ?? false;

  if (!isValidChain(input.chainId, allowLocalDev)) {
    throw new ClaimCreationError(
      "INVALID_CHAIN",
      `chainId ${input.chainId} is not an allowed Optimism chain`,
    );
  }
  if (!isHexAddress(input.walletAccount)) {
    throw new ClaimCreationError(
      "INVALID_WALLET_ACCOUNT",
      "walletAccount must be a 40-hex-character address",
    );
  }
  if (!isHexAddress(input.bountyAsset)) {
    throw new ClaimCreationError(
      "INVALID_BOUNTY_ASSET",
      "bountyAsset must be a 40-hex-character address",
    );
  }
  if (input.artifactVersion !== opts.supportedArtifactVersion) {
    throw new ClaimCreationError(
      "INVALID_ARTIFACT_VERSION",
      `unsupported artifact version ${input.artifactVersion}`,
    );
  }
  if (!isBytes32(input.contentDigest)) {
    throw new ClaimCreationError(
      "INVALID_CONTENT_DIGEST",
      "contentDigest must be 32 bytes",
    );
  }
  if (input.bountyAmount <= 0n) {
    throw new ClaimCreationError(
      "INVALID_BOUNTY_AMOUNT",
      "bountyAmount must be a positive exact integer",
    );
  }
  if (
    typeof input.frozenConfig !== "object" ||
    input.frozenConfig === null ||
    Array.isArray(input.frozenConfig)
  ) {
    throw new ClaimCreationError(
      "INVALID_FROZEN_CONFIG",
      "frozenConfig must be an object",
    );
  }

  return input;
}

export function encodeClaimCreationCall(
  input: ClaimCreationInput,
  adapters: Pick<ClaimCreationAdapters, "encodeClaimCall">,
  opts: { allowLocalDev?: boolean; supportedArtifactVersion: string },
): ClaimCreationCall {
  return adapters.encodeClaimCall(validateClaimCreationInput(input, opts));
}

function isUserRejected(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === 4001 ||
    (typeof candidate.message === "string" &&
      /user rejected|request rejected|denied by user/i.test(candidate.message))
  );
}

export interface ClaimCreationTransactionHook {
  createClaim(
    input: ClaimCreationInput,
    opts: {
      allowLocalDev?: boolean;
      supportedArtifactVersion: string;
      onTransition?: (state: TransactionState) => void;
    },
  ): Promise<ClaimCreationIndexedClaim>;
}

export function createClaimCreationTransactionHook(
  adapters: ClaimCreationAdapters,
): ClaimCreationTransactionHook {
  async function createClaim(
    input: ClaimCreationInput,
    opts: {
      allowLocalDev?: boolean;
      supportedArtifactVersion: string;
      onTransition?: (state: TransactionState) => void;
    },
  ): Promise<ClaimCreationIndexedClaim> {
    const allowLocalDev = opts.allowLocalDev ?? false;
    const onTransition = opts.onTransition ?? (() => {});
    const validated = validateClaimCreationInput(input, opts);

    const call = adapters.encodeClaimCall(validated);
    let state: TransactionState = createIdleState();
    onTransition(state);

    state = transitionTxState(
      state,
      { type: "PREPARE", chainId: validated.chainId },
      { allowLocalDev },
    );
    onTransition(state);

    const allowance = await adapters.getAllowance(validated, call);
    if (allowance < validated.bountyAmount) {
      throw new ClaimCreationError(
        "ALLOWANCE_INSUFFICIENT",
        `allowance ${allowance} below bountyAmount ${validated.bountyAmount}`,
      );
    }

    const simulation = await adapters.simulate(validated, call);
    if (!simulation.ok) {
      throw new ClaimCreationError("SIMULATION_REVERTED", simulation.reason);
    }

    state = transitionTxState(state, { type: "REQUEST_SIGNATURE" });
    onTransition(state);

    let txHash: ClaimCreationHash;
    try {
      txHash = await adapters.submit(validated, call);
    } catch (error) {
      if (isUserRejected(error)) {
        state = transitionTxState(state, { type: "USER_REJECTED" });
        onTransition(state);
        throw new ClaimCreationError(
          "USER_REJECTED",
          "User rejected the claim transaction",
        );
      }
      throw error;
    }

    state = transitionTxState(state, { type: "SUBMIT", txHash });
    onTransition(state);

    const receipt = await adapters.waitForConfirmation(
      txHash,
      validated.chainId,
    );

    state = transitionTxState(state, {
      type: "CONFIRM",
      receiptChainId: receipt.chainId,
      blockNumber: BigInt(receipt.blockNumber),
      confirmations: receipt.confirmations,
    });
    onTransition(state);

    if (receipt.status === "reverted") {
      state = transitionTxState(state, { type: "REVERT" });
      onTransition(state);
      throw new ClaimCreationError(
        "TRANSACTION_REVERTED",
        `transaction ${txHash} reverted`,
      );
    }

    state = transitionTxState(state, { type: "MARK_SAFE" });
    onTransition(state);
    state = transitionTxState(state, { type: "INDEXING" });
    onTransition(state);

    const indexedClaim = await adapters.getIndexedClaim(
      txHash,
      validated.contentDigest,
    );
    if (!indexedClaim) {
      throw new ClaimCreationError(
        "CLAIM_NOT_INDEXED",
        `no indexed claim found for ${txHash}`,
      );
    }
    if (
      indexedClaim.contentDigest.toLowerCase() !==
      validated.contentDigest.toLowerCase()
    ) {
      throw new ClaimCreationError(
        "STALE_RECONCILIATION",
        "indexed claim contentDigest mismatch",
      );
    }
    if (indexedClaim.txHash.toLowerCase() !== txHash.toLowerCase()) {
      throw new ClaimCreationError(
        "STALE_RECONCILIATION",
        "indexed claim txHash mismatch",
      );
    }

    state = transitionTxState(state, { type: "FINALIZE" });
    onTransition(state);

    return indexedClaim;
  }

  return { createClaim };
}
