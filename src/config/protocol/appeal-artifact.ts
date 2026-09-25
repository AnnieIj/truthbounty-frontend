/**
 * V2-FE-059 — Versioned protocol artifact for appeal participation and round
 * progression.
 *
 * Pins the IAppealParticipation interface under an immutable ARTIFACT_VERSION
 * and the deployment release tag. Fail closed when chain/address/ABI/session
 * configuration is missing — never fabricate protocol state.
 */

'use client';

export const APPEAL_SUPPORTED_CHAINS = [10, 11155420] as const;
export type AppealChainId = (typeof APPEAL_SUPPORTED_CHAINS)[number];

/**
 * Immutable version of the pinned appeal participation interface.
 * Bump when IAppealParticipation changes and the ABI below is regenerated.
 */
export const APPEAL_ARTIFACT_VERSION = 'iv-appeal-participation@v1.0.0';

/**
 * AppealRoundState enum (uint8):
 *   0 = NotStarted, 1 = Active, 2 = Ended, 3 = Settled
 */
export const APPEAL_ROUND_STATE = {
  NOT_STARTED: 0,
  ACTIVE: 1,
  ENDED: 2,
  SETTLED: 3,
} as const;

export const appealParticipationAbi = [
  {
    type: 'function',
    name: 'minBondAmount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getAppealRound',
    stateMutability: 'view',
    inputs: [{ name: 'appealId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'roundNumber', type: 'uint256' },
          { name: 'requiredBond', type: 'uint256' },
          { name: 'deadline', type: 'uint64' },
          { name: 'supportStake', type: 'uint256' },
          { name: 'opposeStake', type: 'uint256' },
          { name: 'state', type: 'uint8' },
          { name: 'claimId', type: 'bytes32' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'hasParticipatedInAppeal',
    stateMutability: 'view',
    inputs: [
      { name: 'appealId', type: 'bytes32' },
      { name: 'participant', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getAppealParticipant',
    stateMutability: 'view',
    inputs: [
      { name: 'appealId', type: 'bytes32' },
      { name: 'participant', type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'hasParticipated', type: 'bool' },
          { name: 'support', type: 'bool' },
          { name: 'stake', type: 'uint256' },
          { name: 'participatedAt', type: 'uint64' },
          { name: 'roundNumber', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'participateInAppeal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'appealId', type: 'bytes32' },
      { name: 'support', type: 'bool' },
      { name: 'stakeAmount', type: 'uint256' },
      { name: 'expectedRound', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export const appealErc20Abi = [
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

export interface AppealArtifactAddresses {
  appealParticipation: `0x${string}`;
  stakingToken: `0x${string}`;
}

export interface AppealArtifact {
  chainId: AppealChainId;
  releaseTag: string | null;
  artifactVersion: string;
  addresses: AppealArtifactAddresses;
  isDeployed: boolean;
  disabledReasons: string[];
}

export interface AppealArtifactEnv {
  NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG?: string;
  NEXT_PUBLIC_TRUTHBOUNTY_APPEAL_PARTICIPATION_ADDRESS?: string;
  NEXT_PUBLIC_TRUTHBOUNTY_STAKING_TOKEN_ADDRESS?: string;
  [key: string]: string | undefined;
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const FORBIDDEN_RELEASE_TAGS = /dummy|placeholder|zero|todo|example/i;

function isUnsupportedChain(chainId: number): boolean {
  return !(APPEAL_SUPPORTED_CHAINS as readonly number[]).includes(chainId);
}

export function resolveAppealArtifact(
  env: AppealArtifactEnv,
  chainId: number
): AppealArtifact {
  const disabledReasons: string[] = [];

  if (isUnsupportedChain(chainId)) {
    disabledReasons.push(
      `chain ${chainId} is not a supported appeal participation chain`
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

  const rawAppeal = readAddress(
    'NEXT_PUBLIC_TRUTHBOUNTY_APPEAL_PARTICIPATION_ADDRESS'
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
    return raw.toLowerCase() as `0x${string}`;
  };

  const appealParticipation = validate(
    rawAppeal,
    'AppealParticipation',
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
    disabledReasons.push(`release tag "${releaseTag}" is not a real pin`);
  }

  const isDeployed =
    disabledReasons.length === 0 &&
    appealParticipation !== null &&
    stakingToken !== null;

  return {
    chainId: (isUnsupportedChain(chainId)
      ? 10
      : chainId) as AppealChainId,
    releaseTag,
    artifactVersion: APPEAL_ARTIFACT_VERSION,
    addresses: {
      appealParticipation:
        appealParticipation ??
        ('0x0000000000000000000000000000000000000000' as `0x${string}`),
      stakingToken:
        stakingToken ??
        ('0x0000000000000000000000000000000000000000' as `0x${string}`),
    },
    isDeployed,
    disabledReasons,
  };
}

export function getAppealArtifact(chainId: number): AppealArtifact {
  return resolveAppealArtifact(
    process.env as unknown as AppealArtifactEnv,
    chainId
  );
}
