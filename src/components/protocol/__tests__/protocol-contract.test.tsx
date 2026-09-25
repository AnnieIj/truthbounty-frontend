/**
 * V2-FE-141 — Component-level protocol contract tests.
 *
 * Asserts fail-closed readiness, every documented lifecycle state, canonical
 * artifact binding, and that the UI never invents protocol outcomes.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  resolveProtocolContractUi,
  type ProtocolLifecycleState,
  type ProtocolContractSnapshot,
} from '@/lib/protocol-contract';
import { ProtocolContractBoundary } from '@/components/protocol/ProtocolContractBoundary';
import { ProtocolContractStatus } from '@/components/protocol/ProtocolContractStatus';
import type { VerificationArtifact } from '@/config/protocol/verification-artifact';
import type { ProtocolDiagnostics } from '@/lib/contracts/types';

expect.extend(toHaveNoViolations);

const CANONICAL = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const deployedArtifact = (overrides: Partial<VerificationArtifact> = {}): VerificationArtifact => ({
  chainId: 11155420,
  releaseTag: 'v2-sc-010@v0.1.0',
  artifactVersion: 'iv-verification-submission@v1.0.0',
  addresses: {
    verificationSubmission: '0x1111111111111111111111111111111111111111',
    claimRegistry: '0x2222222222222222222222222222222222222222',
    stakingToken: '0x3333333333333333333333333333333333333333',
  },
  isDeployed: true,
  disabledReasons: [],
  ...overrides,
});

const diagnostics: ProtocolDiagnostics = {
  protocolVersion: '2.0.0',
  releaseId: 'v2.0.0-sepolia',
  chainId: 11155420,
  gitCommit: '0000000000000000000000000000000000000000',
  artifactPath: 'release',
  verifiedAt: '2026-09-24T00:00:00.000Z',
  contracts: { TruthBountyWeighted: CANONICAL },
};

function snapshotFor(
  lifecycle: ProtocolLifecycleState,
  artifact: VerificationArtifact = deployedArtifact(),
  canonicalAddress: string | null = CANONICAL,
): ProtocolContractSnapshot {
  return resolveProtocolContractUi({
    chainId: artifact.chainId,
    lifecycle,
    artifact,
    diagnostics,
    canonicalAddress,
  });
}

const ALL_LIFECYCLES: ProtocolLifecycleState[] = [
  'loading',
  'empty',
  'stale',
  'rejected',
  'failed',
  'pending',
  'confirmed',
  'finalized',
  'reorged',
];

describe('resolveProtocolContractUi', () => {
  it('allows mutation only when ready and lifecycle is non-blocking', () => {
    expect(snapshotFor('empty').allowsMutation).toBe(true);
    expect(snapshotFor('pending').allowsMutation).toBe(true);
    expect(snapshotFor('confirmed').allowsMutation).toBe(true);
    expect(snapshotFor('finalized').allowsMutation).toBe(true);
    expect(snapshotFor('loading').allowsMutation).toBe(false);
    expect(snapshotFor('stale').allowsMutation).toBe(false);
    expect(snapshotFor('rejected').allowsMutation).toBe(false);
    expect(snapshotFor('failed').allowsMutation).toBe(false);
    expect(snapshotFor('reorged').allowsMutation).toBe(false);
  });

  it('fails closed on unsupported chain without inventing readiness', () => {
    const artifact = deployedArtifact({
      chainId: 1 as VerificationArtifact['chainId'],
      isDeployed: false,
      disabledReasons: ['chain 1 is not a supported verification chain'],
    });
    const snap = snapshotFor('empty', artifact);
    expect(snap.readiness).toBe('unsupported_chain');
    expect(snap.allowsMutation).toBe(false);
    expect(snap.blockingReasons.join(' ')).toMatch(/supported verification chain/i);
  });

  it('fails closed when protocol addresses are not pinned', () => {
    const artifact = deployedArtifact({
      isDeployed: false,
      disabledReasons: ['VerificationSubmission address is not pinned in the deployment release'],
      addresses: {
        verificationSubmission: '' as `0x${string}`,
        claimRegistry: '' as `0x${string}`,
        stakingToken: '' as `0x${string}`,
      },
    });
    const snap = snapshotFor('empty', artifact);
    expect(snap.readiness).toBe('missing_config');
    expect(snap.allowsMutation).toBe(false);
  });

  it('fails closed on invalid canonical address', () => {
    const snap = snapshotFor('empty', deployedArtifact(), '0x0000000000000000000000000000000000000000');
    expect(snap.readiness).toBe('invalid_address');
    expect(snap.allowsMutation).toBe(false);
    expect(snap.canonicalAddress).toBeNull();
  });

  it('binds the canonical contract address when valid', () => {
    const snap = snapshotFor('confirmed');
    expect(snap.canonicalAddress).toBe(CANONICAL);
    expect(snap.protocolVersion).toBe('2.0.0');
    expect(snap.releaseChainId).toBe(11155420);
  });
});

describe('ProtocolContractStatus', () => {
  it.each(ALL_LIFECYCLES)('renders accessible lifecycle state: %s', async (lifecycle) => {
    const snap = snapshotFor(lifecycle);
    const { container } = render(<ProtocolContractStatus snapshot={snap} />);
    const root = screen.getByTestId('protocol-contract-status');
    expect(root).toHaveAttribute('data-lifecycle', lifecycle);
    expect(root).toHaveAttribute('role', 'status');
    expect(within(root).getByText(new RegExp(lifecycle === 'empty' ? 'No protocol transaction' : '.', 'i'))).toBeTruthy();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('never fabricates a transaction hash or reward amount', () => {
    render(<ProtocolContractStatus snapshot={snapshotFor('confirmed')} />);
    expect(screen.queryByText(/0x[a-f0-9]{64}/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/reward/i)).not.toBeInTheDocument();
  });
});

describe('ProtocolContractBoundary', () => {
  it('renders children when protocol is ready and lifecycle is empty', () => {
    render(
      <ProtocolContractBoundary
        chainId={11155420}
        snapshotOverride={snapshotFor('empty')}
      >
        <button type="button">Submit verification</button>
      </ProtocolContractBoundary>,
    );
    expect(screen.getByRole('button', { name: /submit verification/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks children on missing config (fail closed)', () => {
    const artifact = deployedArtifact({
      isDeployed: false,
      disabledReasons: ['protocol release tag is not pinned'],
    });
    render(
      <ProtocolContractBoundary
        chainId={11155420}
        snapshotOverride={snapshotFor('empty', artifact)}
      >
        <button type="button">Submit verification</button>
      </ProtocolContractBoundary>,
    );
    expect(screen.queryByRole('button', { name: /submit verification/i })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/will not invent success/i);
  });

  it('blocks children when lifecycle is reorged or stale', () => {
    for (const lifecycle of ['reorged', 'stale', 'failed', 'rejected', 'loading'] as ProtocolLifecycleState[]) {
      const { unmount } = render(
        <ProtocolContractBoundary
          chainId={11155420}
          snapshotOverride={snapshotFor(lifecycle)}
        >
          <button type="button">Mutate</button>
        </ProtocolContractBoundary>,
      );
      expect(screen.queryByRole('button', { name: /mutate/i })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('keeps pending/confirmed/finalized visible without fabricating success copy', () => {
    render(
      <ProtocolContractBoundary
        chainId={11155420}
        snapshotOverride={snapshotFor('pending')}
      >
        <span>Awaiting wallet</span>
      </ProtocolContractBoundary>,
    );
    expect(screen.getByText(/protocol lifecycle pending/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting wallet/i)).toBeInTheDocument();
    expect(screen.queryByText(/settled|reward claimed|finalized on-chain automatically/i)).not.toBeInTheDocument();
  });

  it('is accessible when blocked', async () => {
    const artifact = deployedArtifact({
      isDeployed: false,
      disabledReasons: ['chain 1 is not a supported verification chain'],
    });
    const { container } = render(
      <ProtocolContractBoundary
        chainId={1}
        snapshotOverride={snapshotFor('empty', artifact)}
      >
        <button type="button">Hidden</button>
      </ProtocolContractBoundary>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
