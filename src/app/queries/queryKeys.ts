/**
 * Canonical TanStack Query key factories (V2-FE-063).
 *
 * Covers chain, wallet, claim, projection watermark, filters, and finality
 * so cache entries cannot collide across wallets, chains, or projections.
 *
 * Rules:
 *  1. Every key is an immutable `as const` tuple — never a bare string.
 *  2. Wallet-scoped keys always include normalized address + chainId.
 *  3. Fail closed on unsupported address / chain inputs (null scope).
 *  4. Existing key shapes are preserved for backward compatibility.
 *  5. No fabricated calldata, hashes, receipts, or mock-wallet values.
 */

/** EIP-155 chain id. */
export type ChainId = number;

/** Checksum-agnostic 0x-prefixed address. */
export type EvmAddress = `0x${string}` | string;

/**
 * Normalize an EVM address for cache-key stability.
 * Returns null (fail closed) when the address is missing or malformed.
 */
export function normalizeAddress(address: string | null | undefined): string | null {
  if (typeof address !== 'string') return null;
  const trimmed = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Validate wallet scope inputs. Returns null when either part is unsupported.
 */
export function walletScope(
  address: string | null | undefined,
  chainId: number | null | undefined,
): { address: string; chainId: number } | null {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  if (typeof chainId !== 'number' || !Number.isInteger(chainId) || chainId <= 0) {
    return null;
  }
  return { address: normalized, chainId };
}

export type ClaimListFilters = {
  status?: string;
  category?: string;
  cursor?: string;
  limit?: number;
  sort?: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------
export const chainKeys = {
  all: ['chain'] as const,
  /** Canonical chain config / feature flags for a chainId. */
  config: (chainId: ChainId) => ['chain', 'config', chainId] as const,
  /** Live chain health / tip metadata. */
  status: (chainId: ChainId) => ['chain', 'status', chainId] as const,
  /** Block tip by finality tag (never invents block numbers). */
  block: (chainId: ChainId, tag: 'latest' | 'safe' | 'finalized') =>
    ['chain', 'block', chainId, tag] as const,
} as const;

// ---------------------------------------------------------------------------
// Wallet (always address + chain scoped)
// ---------------------------------------------------------------------------
export const walletKeys = {
  all: ['wallet'] as const,
  /** Root for a single wallet+chain pair — use for scoped invalidation. */
  scope: (address: string, chainId: ChainId) => {
    const scope = walletScope(address, chainId);
    return scope
      ? (['wallet', 'scope', scope.address, scope.chainId] as const)
      : (['wallet', 'scope', 'invalid'] as const);
  },
  balance: (address: string, chainId: ChainId) => {
    const scope = walletScope(address, chainId);
    return scope
      ? (['wallet', 'balance', scope.address, scope.chainId] as const)
      : (['wallet', 'balance', 'invalid'] as const);
  },
  tokenBalance: (address: string, tokenAddress: string, chainId: ChainId) => {
    const scope = walletScope(address, chainId);
    const token = normalizeAddress(tokenAddress);
    return scope && token
      ? (['wallet', 'token', scope.address, token, scope.chainId] as const)
      : (['wallet', 'token', 'invalid'] as const);
  },
  nonce: (address: string, chainId: ChainId) => {
    const scope = walletScope(address, chainId);
    return scope
      ? (['wallet', 'nonce', scope.address, scope.chainId] as const)
      : (['wallet', 'nonce', 'invalid'] as const);
  },
  allowance: (address: string, spender: string, tokenAddress: string, chainId: ChainId) => {
    const scope = walletScope(address, chainId);
    const sp = normalizeAddress(spender);
    const token = normalizeAddress(tokenAddress);
    return scope && sp && token
      ? (['wallet', 'allowance', scope.address, sp, token, scope.chainId] as const)
      : (['wallet', 'allowance', 'invalid'] as const);
  },
} as const;

// ---------------------------------------------------------------------------
// Claim (preserves legacy shapes + adds list / wallet / finality)
// ---------------------------------------------------------------------------
export const claimKeys = {
  /** Legacy root — invalidate entire claims namespace. */
  all: ['claims'] as const,
  /** Paginated / filtered list root. */
  lists: () => ['claims', 'list'] as const,
  /** Filtered list — filters object is part of the key to avoid collisions. */
  list: (filters: ClaimListFilters = {}) => ['claims', 'list', filters] as const,
  /**
   * Legacy detail shape `['claims', claimId]` — kept so existing cache
   * consumers (useClaimDetail, realtime handlers) keep working.
   */
  detail: (claimId: string) => ['claims', claimId] as const,
  byStatus: (status: string) => ['claims', 'status', status] as const,
  /** Wallet-scoped claim index for the connected account. */
  byWallet: (address: string, chainId: ChainId) => {
    const scope = walletScope(address, chainId);
    return scope
      ? (['claims', 'wallet', scope.address, scope.chainId] as const)
      : (['claims', 'wallet', 'invalid'] as const);
  },
  finality: (claimId: string, chainId: ChainId) =>
    ['claims', 'finality', claimId, chainId] as const,
} as const;

// ---------------------------------------------------------------------------
// Projection watermark (indexer / projection sync cursor)
// ---------------------------------------------------------------------------
export const projectionWatermarkKeys = {
  all: ['projectionWatermark'] as const,
  byChain: (chainId: ChainId) => ['projectionWatermark', 'chain', chainId] as const,
  byNamespace: (namespace: string, chainId: ChainId) =>
    ['projectionWatermark', namespace, chainId] as const,
  entity: (namespace: string, entityId: string, chainId: ChainId) =>
    ['projectionWatermark', namespace, entityId, chainId] as const,
} as const;

// ---------------------------------------------------------------------------
// Filters (UI / route filter state that drives queries)
// ---------------------------------------------------------------------------
export const filterKeys = {
  all: ['filters'] as const,
  claims: (filters: ClaimListFilters) => ['filters', 'claims', filters] as const,
  activity: (address: string, filters: Record<string, unknown> = {}) => {
    const addr = normalizeAddress(address);
    return addr
      ? (['filters', 'activity', addr, filters] as const)
      : (['filters', 'activity', 'invalid', filters] as const);
  },
  leaderboard: (filters: Record<string, unknown> = {}) =>
    ['filters', 'leaderboard', filters] as const,
} as const;

// ---------------------------------------------------------------------------
// Finality (receipt-driven observed / safe / finalized — never timers)
// ---------------------------------------------------------------------------
export const finalityKeys = {
  all: ['finality'] as const,
  byTx: (txHash: string, chainId: ChainId) =>
    ['finality', 'tx', txHash.toLowerCase(), chainId] as const,
  byEntity: (entityType: string, entityId: string, chainId: ChainId) =>
    ['finality', 'entity', entityType, entityId, chainId] as const,
  level: (entityType: string, entityId: string, chainId: ChainId) =>
    ['finality', 'level', entityType, entityId, chainId] as const,
} as const;

// ---------------------------------------------------------------------------
// Legacy namespaces (unchanged shapes)
// ---------------------------------------------------------------------------
export const verificationsKeys = {
  all: ['verifications'] as const,
  byClaim: (claimId: string) => ['verifications', 'claim', claimId] as const,
  byUser: (userId: string) => ['verifications', 'user', userId] as const,
} as const;

export const disputesKeys = {
  all: ['disputes'] as const,
  byClaim: (claimId: string) => ['disputes', 'claim', claimId] as const,
  detail: (disputeId: string) => ['disputes', disputeId] as const,
} as const;

export const userKeys = {
  all: ['user'] as const,
  profile: (userId: string) => ['user', userId] as const,
  reputation: (userId: string) => ['user', userId, 'reputation'] as const,
  verification: (userId: string) => ['user', userId, 'verification'] as const,
} as const;

export const leaderboardKeys = {
  all: ['leaderboard'] as const,
} as const;

/**
 * Unified export — existing `queryKeys.*` consumers keep working.
 * New V2-FE-063 factories are exposed both nested and as named exports.
 */
export const queryKeys = {
  chain: chainKeys,
  wallet: walletKeys,
  claims: claimKeys,
  claim: claimKeys,
  projectionWatermark: projectionWatermarkKeys,
  filters: filterKeys,
  finality: finalityKeys,
  verifications: verificationsKeys,
  disputes: disputesKeys,
  leaderboard: leaderboardKeys.all,
  user: userKeys,
} as const;
