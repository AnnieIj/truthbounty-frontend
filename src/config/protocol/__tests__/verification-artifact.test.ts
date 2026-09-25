import {
  ARTIFACT_VERSION,
  VERIFICATION_SUPPORTED_CHAINS,
  resolveVerificationArtifact,
  VerificationArtifact,
} from '@/config/protocol/verification-artifact';

const DEPLOYED_ENV = {
  NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG: 'v2-sc-010@v0.1.0',
  NEXT_PUBLIC_TRUTHBOUNTY_VERIFICATION_SUBMISSION_ADDRESS:
    '0x1111111111111111111111111111111111111111',
  NEXT_PUBLIC_TRUTHBOUNTY_CLAIM_REGISTRY_ADDRESS:
    '0x2222222222222222222222222222222222222222',
  NEXT_PUBLIC_TRUTHBOUNTY_STAKING_TOKEN_ADDRESS:
    '0x3333333333333333333333333333333333333333',
};

const expectDisabled = (artifact: VerificationArtifact, reason: RegExp) => {
  expect(artifact.isDeployed).toBe(false);
  expect(artifact.disabledReasons.length).toBeGreaterThan(0);
  expect(artifact.disabledReasons.join('; ')).toMatch(reason);
};

describe('resolveVerificationArtifact', () => {
  it('resolves a deployed artifact when the release is fully pinned', () => {
    const artifact = resolveVerificationArtifact(DEPLOYED_ENV, 11155420);

    expect(artifact.isDeployed).toBe(true);
    expect(artifact.chainId).toBe(11155420);
    expect(artifact.releaseTag).toBe('v2-sc-010@v0.1.0');
    expect(artifact.artifactVersion).toBe(ARTIFACT_VERSION);
    expect(artifact.disabledReasons).toHaveLength(0);
  });

  it('normalizes addresses to lowercase', () => {
    const artifact = resolveVerificationArtifact(DEPLOYED_ENV, 10);

    expect(artifact.addresses.verificationSubmission).toBe(
      '0x1111111111111111111111111111111111111111'
    );
  });

  it('prefers per-chain address suffixes over generic values', () => {
    const artifact = resolveVerificationArtifact(
      {
        ...DEPLOYED_ENV,
        NEXT_PUBLIC_TRUTHBOUNTY_VERIFICATION_SUBMISSION_ADDRESS_10:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      10
    );

    expect(artifact.addresses.verificationSubmission).toBe(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
  });

  it('fails closed on an unsupported chain', () => {
    const artifact = resolveVerificationArtifact(DEPLOYED_ENV, 1);
    expectDisabled(artifact, /not a supported verification chain/);
  });

  it('fails closed when no environment is pinned at all', () => {
    const artifact = resolveVerificationArtifact({}, 10);
    expectDisabled(artifact, /not pinned/);
  });

  it('fails closed when the release tag is missing', () => {
    const env: Record<string, string | undefined> = { ...DEPLOYED_ENV };
    delete env.NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG;
    expectDisabled(resolveVerificationArtifact(env, 10), /release tag/);
  });

  it('fails closed on dummy/placeholder release tags', () => {
    expectDisabled(
      resolveVerificationArtifact({ ...DEPLOYED_ENV, NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG: 'dummy' }, 10),
      /not a real release/
    );
    expectDisabled(
      resolveVerificationArtifact({ ...DEPLOYED_ENV, NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG: 'TODO-v2' }, 10),
      /not a real release/
    );
  });

  it('fails closed when any required address is missing', () => {
    const env: Record<string, string | undefined> = { ...DEPLOYED_ENV };
    delete env.NEXT_PUBLIC_TRUTHBOUNTY_STAKING_TOKEN_ADDRESS;
    expectDisabled(resolveVerificationArtifact(env, 10), /StakingToken/);
  });

  it('fails closed on malformed addresses', () => {
    expectDisabled(
      resolveVerificationArtifact(
        { ...DEPLOYED_ENV, NEXT_PUBLIC_TRUTHBOUNTY_CLAIM_REGISTRY_ADDRESS: '0xshort' },
        10
      ),
      /ClaimRegistry.*valid EVM address/
    );
  });

  it('fails closed on zero placeholder addresses', () => {
    expectDisabled(
      resolveVerificationArtifact(
        {
          ...DEPLOYED_ENV,
          NEXT_PUBLIC_TRUTHBOUNTY_VERIFICATION_SUBMISSION_ADDRESS:
            '0x0000000000000000000000000000000000000000',
        },
        10
      ),
      /zero\/placeholder/
    );
  });

  it('fails closed on dummy placeholder addresses', () => {
    expectDisabled(
      resolveVerificationArtifact(
        {
          ...DEPLOYED_ENV,
          NEXT_PUBLIC_TRUTHBOUNTY_CLAIM_REGISTRY_ADDRESS: '0xDummyContractAddressPlaceholder000000',
        },
        10
      ),
      /placeholder|valid EVM/i
    );
  });

  it('lists every supported chain', () => {
    // Optimism mainnet + Sepolia only; never fabricate chain support.
    expect(VERIFICATION_SUPPORTED_CHAINS).toEqual([10, 11155420]);
  });
});
