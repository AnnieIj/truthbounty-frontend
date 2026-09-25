import {
  resolveProtocolContractUi,
  resolveProtocolReadiness,
} from '@/lib/protocol-contract';
import type { VerificationArtifact } from '@/config/protocol/verification-artifact';
import type { ProtocolDiagnostics } from '@/lib/contracts/types';

const CANONICAL = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const artifact = (over: Partial<VerificationArtifact> = {}): VerificationArtifact => ({
  chainId: 11155420,
  releaseTag: 'v2.0.0',
  artifactVersion: 'iv-verification-submission@v1.0.0',
  addresses: {
    verificationSubmission: '0x1111111111111111111111111111111111111111',
    claimRegistry: '0x2222222222222222222222222222222222222222',
    stakingToken: '0x3333333333333333333333333333333333333333',
  },
  isDeployed: true,
  disabledReasons: [],
  ...over,
});

const diagnostics: ProtocolDiagnostics = {
  protocolVersion: '2.0.0',
  releaseId: 'v2.0.0-sepolia',
  chainId: 11155420,
  gitCommit: 'abc',
  artifactPath: 'release',
  verifiedAt: '2026-09-24T00:00:00.000Z',
  contracts: { TruthBountyWeighted: CANONICAL },
};

describe('protocol-contract ui-state', () => {
  it('defaults lifecycle to empty without inventing pending/confirmed', () => {
    const snap = resolveProtocolContractUi({
      chainId: 11155420,
      artifact: artifact(),
      diagnostics,
      canonicalAddress: CANONICAL,
    });
    expect(snap.lifecycle).toBe('empty');
    expect(snap.allowsMutation).toBe(true);
  });

  it('classify unsupported vs missing config', () => {
    expect(
      resolveProtocolReadiness(
        artifact({
          isDeployed: false,
          disabledReasons: ['chain 8453 is not a supported verification chain'],
        }),
        CANONICAL,
      ).readiness,
    ).toBe('unsupported_chain');

    expect(
      resolveProtocolReadiness(
        artifact({
          isDeployed: false,
          disabledReasons: ['protocol release tag is not pinned'],
        }),
        CANONICAL,
      ).readiness,
    ).toBe('missing_config');
  });
});
