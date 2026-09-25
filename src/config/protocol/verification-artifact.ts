/**
 * V2-FE-013 — Versioned protocol artifact for the canonical verification
 * submission runtime.
 *
 * The contract interface is NOT frozen upstream, so this module pins the
 * exact interface this frontend was built against (`IVerificationSubmission`,
 * `IClaimRegistry`, ERC-20) under a single immutable `ARTIFACT_VERSION`
 * string and the deployment release tag supplied through the environment.
 *
 * Fail-closed rules (per PROTOCOL_V2_SPEC §23 / §26 / ADR-0001):
 *   - An artifact is only `isDeployed` when every required address is pinned
 *     via env for the active chain AND a real release tag is set.
 *   - Missing/empty/dummy/zero addresses disable the hook with explicit
 *     reasons — the frontend never fabricates or guesses protocol state.
 */

'use client';

export const VERIFICATION_SUPPORTED_CHAINS = [10, 11155420] as const;
export type VerificationChainId = (typeof VERIFICATION_SUPPORTED_CHAINS)[number];

/**
 * Immutable version of the pinned interface.
 * Bump this when the upstream interface (V2-SC-010 / IVerificationSubmission)
 * changes and the ABI below is regenerated.
 */
export const ARTIFACT_VERSION = 'iv-verification-submission@v1.0.0';

// ---------------------------------------------------------------------------
// ABI fragments — generated from the canonical V2 interfaces
// (DigiNodes/truthbounty-contract: contracts/interfaces/IVerificationSubmission.sol,
//  contracts/interfaces/IClaimRegistry.sol, OpenZeppelin IERC20).
// `verdict` is `VerificationVerdict` enum-encoded as uint8 (TRUE = 0, FALSE = 1).
// ---------------------------------------------------------------------------

export const verificationSubmissionAbi = [
  {
    type: 'function',
    name: 'minStakeAmount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'hasVerified',
    stateMutability: 'view',
    inputs: [
      { name: 'claimId', type: 'uint256' },
      { name: 'verifier', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getVerifierStake',
    stateMutability: 'view',
    inputs: [
      { name: 'claimId', type: 'uint256' },
      { name: 'verifier', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getClaimVerifications',
    stateMutability: 'view',
    inputs: [{ name: 'claimId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'getVerification',
    stateMutability: 'view',
    inputs: [{ name: 'verificationId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'claimId', type: 'uint256' },
          { name: 'verifier', type: 'address' },
          { name: 'verdict', type: 'uint8' },
          { name: 'stake', type: 'uint256' },
          { name: 'submittedAt', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'submitVerification',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'claimId', type: 'uint256' },
      { name: 'verdict', type: 'uint8' },
      { name: 'stakeAmount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export const claimRegistryAbi = [
  {
    type: 'function',
    name: 'getClaim',
    stateMutability: 'view',
    inputs: [{ name: 'claimId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'creator', type: 'address' },
          { name: 'statement', type: 'string' },
          { name: 'evidenceCID', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'verificationDeadline', type: 'uint64' },
        ],
      },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface VerificationArtifactAddresses {
  verificationSubmission: `0x${string}`;
  claimRegistry: `0x${string}`;
  stakingToken: `0x${string}`;
}

export interface VerificationArtifact {
  chainId: VerificationChainId;
  releaseTag: string | null;
  artifactVersion: string;
  addresses: VerificationArtifactAddresses;
  isDeployed: boolean;
  disabledReasons: string[];
}

/**
 * Environment snapshot used to resolve the artifact. Keys mirror
 * `NEXT_PUBLIC_*` env vars with optional per-chain suffixes (`_10`,
 * `_11155420`) that take precedence over the chain-agnostic value.
 */
export interface ProtocolArtifactEnv {
  NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG?: string;
  NEXT_PUBLIC_TRUTHBOUNTY_VERIFICATION_SUBMISSION_ADDRESS?: string;
  NEXT_PUBLIC_TRUTHBOUNTY_CLAIM_REGISTRY_ADDRESS?: string;
  NEXT_PUBLIC_TRUTHBOUNTY_STAKING_TOKEN_ADDRESS?: string;
  [key: string]: string | undefined;
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const FORBIDDEN_RELEASE_TAGS = /dummy|placeholder|zero|todo|example/i;

function isUnsupportedChain(chainId: number): boolean {
  return !(VERIFICATION_SUPPORTED_CHAINS as readonly number[]).includes(chainId);
}

/**
 * Pure artifact resolver. Exported separately from `getVerificationArtifact`
 * so tests can exercise it with a fabricated environment.
 */
export function resolveVerificationArtifact(
  env: ProtocolArtifactEnv,
  chainId: number
): VerificationArtifact {
  const disabledReasons: string[] = [];

  if (isUnsupportedChain(chainId)) {
    disabledReasons.push(
      `chain ${chainId} is not a supported verification chain`
    );
  }

  const chainSuffix = String(chainId);
  const readAddress = (baseKey: string): string | undefined => {
    const perChain = env[`${baseKey}_${chainSuffix}`];
    if (perChain && perChain.trim() !== '') return perChain.trim();
    const generic = env[baseKey];
    if (generic && generic.trim() !== '') return generic.trim();
    return undefined;
  };

  const rawSubmission = readAddress(
    'NEXT_PUBLIC_TRUTHBOUNTY_VERIFICATION_SUBMISSION_ADDRESS'
  );
  const rawRegistry = readAddress(
    'NEXT_PUBLIC_TRUTHBOUNTY_CLAIM_REGISTRY_ADDRESS'
  );
  const rawStakingToken = readAddress(
    'NEXT_PUBLIC_TRUTHBOUNTY_STAKING_TOKEN_ADDRESS'
  );
  const releaseTag =
    env.NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG?.trim() || null;

  const validate = (
    raw: string | undefined,
    label: string,
    reasons: string[]
  ): `0x${string}` | null => {
    if (!raw) {
      reasons.push(`${label} address is not pinned in the deployment release`);
      return null;
    }
    if (!EVM_ADDRESS_RE.test(raw)) {
      reasons.push(`${label} address is not a valid EVM address`);
      return null;
    }
    if (raw.toLowerCase() === '0x0000000000000000000000000000000000000000') {
      reasons.push(`${label} address is a zero/placeholder address`);
      return null;
    }
    if (/yourcontract|placeholder|dummy|mock|testaddress/i.test(raw)) {
      reasons.push(`${label} address is a placeholder/dummy address`);
      return null;
    }
    return raw.toLowerCase() as `0x${string}`;
  };

  const submission = validate(
    rawSubmission,
    'VerificationSubmission',
    disabledReasons
  );
  const registry = validate(
    rawRegistry,
    'ClaimRegistry',
    disabledReasons
  );
  const stakingToken = validate(
    rawStakingToken,
    'StakingToken',
    disabledReasons
  );

  if (!releaseTag) {
    disabledReasons.push(
      'protocol release tag is not pinned (NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG)'
    );
  } else if (FORBIDDEN_RELEASE_TAGS.test(releaseTag)) {
    disabledReasons.push(`release tag "${releaseTag}" is not a real release`);
  }

  return {
    chainId: chainId as VerificationChainId,
    releaseTag,
    artifactVersion: ARTIFACT_VERSION,
    addresses: {
      verificationSubmission: submission ?? ('' as `0x${string}`),
      claimRegistry: registry ?? ('' as `0x${string}`),
      stakingToken: stakingToken ?? ('' as `0x${string}`),
    },
    isDeployed:
      disabledReasons.length === 0 &&
      Boolean(submission && registry && stakingToken && releaseTag),
    disabledReasons,
  };
}

/**
 * Resolve the active artifact from the process environment.
 * Fails closed when the deployment release is not pinned for the chain.
 */
export function getVerificationArtifact(
  chainId: number
): VerificationArtifact {
  return resolveVerificationArtifact(
    process.env as ProtocolArtifactEnv,
    chainId
  );
}
