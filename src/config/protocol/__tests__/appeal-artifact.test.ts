/**
 * Unit tests for appeal-artifact resolver (V2-FE-059).
 */

import {
  APPEAL_ARTIFACT_VERSION,
  resolveAppealArtifact,
} from '../appeal-artifact';

const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';

describe('resolveAppealArtifact', () => {
  it('fails closed on unsupported chain', () => {
    const artifact = resolveAppealArtifact(
      {
        NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG: 'v2@1',
        NEXT_PUBLIC_TRUTHBOUNTY_APPEAL_PARTICIPATION_ADDRESS: ADDR_A,
        NEXT_PUBLIC_TRUTHBOUNTY_STAKING_TOKEN_ADDRESS: ADDR_B,
      },
      1
    );
    expect(artifact.isDeployed).toBe(false);
    expect(artifact.disabledReasons.some((r) => r.includes('not a supported'))).toBe(
      true
    );
  });

  it('fails closed when addresses are missing', () => {
    const artifact = resolveAppealArtifact(
      { NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG: 'v2@1' },
      11155420
    );
    expect(artifact.isDeployed).toBe(false);
    expect(artifact.disabledReasons.length).toBeGreaterThan(0);
  });

  it('resolves when fully pinned on Optimism Sepolia', () => {
    const artifact = resolveAppealArtifact(
      {
        NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG: 'v2-sc-appeal@v0.1.0',
        NEXT_PUBLIC_TRUTHBOUNTY_APPEAL_PARTICIPATION_ADDRESS: ADDR_A,
        NEXT_PUBLIC_TRUTHBOUNTY_STAKING_TOKEN_ADDRESS: ADDR_B,
      },
      11155420
    );
    expect(artifact.isDeployed).toBe(true);
    expect(artifact.artifactVersion).toBe(APPEAL_ARTIFACT_VERSION);
    expect(artifact.addresses.appealParticipation).toBe(ADDR_A);
    expect(artifact.addresses.stakingToken).toBe(ADDR_B);
  });

  it('rejects placeholder release tags', () => {
    const artifact = resolveAppealArtifact(
      {
        NEXT_PUBLIC_TRUTHBOUNTY_PROTOCOL_RELEASE_TAG: 'dummy',
        NEXT_PUBLIC_TRUTHBOUNTY_APPEAL_PARTICIPATION_ADDRESS: ADDR_A,
        NEXT_PUBLIC_TRUTHBOUNTY_STAKING_TOKEN_ADDRESS: ADDR_B,
      },
      10
    );
    expect(artifact.isDeployed).toBe(false);
    expect(artifact.disabledReasons.some((r) => r.includes('not a real pin'))).toBe(
      true
    );
  });
});
