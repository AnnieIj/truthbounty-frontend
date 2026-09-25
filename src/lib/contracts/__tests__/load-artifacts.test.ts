import {
  loadReleaseArtifacts,
  resolveReleaseDir,
  isValidContractAddress,
} from '@/lib/contracts';

describe('contract release artifacts', () => {
  const releaseDir = resolveReleaseDir();

  it('loads and verifies the pinned release package', () => {
    const release = loadReleaseArtifacts({ releaseDir });
    expect(release.manifest.protocolVersion).toBe('2.0.0');
    expect(release.addresses.TruthBountyWeighted).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(isValidContractAddress(release.addresses.TruthBountyWeighted)).toBe(true);
  });

  it('rejects checksum-invalid artifacts', () => {
    expect(() =>
      loadReleaseArtifacts({
        releaseDir,
        expectedProtocolVersion: '99.0.0',
      }),
    ).toThrow(/Stale protocol release/);
  });

  it('rejects placeholder contract addresses', () => {
    expect(isValidContractAddress('0xYourContractAddress000000000000000000')).toBe(false);
    expect(isValidContractAddress('0x0000000000000000000000000000000000000000')).toBe(
      false,
    );
  });

  it('exposes diagnostics with active protocol version', async () => {
    const { getProtocolDiagnostics } = await import('@/lib/contracts/registry');
    const diagnostics = getProtocolDiagnostics();
    expect(diagnostics.protocolVersion).toBe('2.0.0');
    expect(diagnostics.chainId).toBe(11155420);
    expect(diagnostics.contracts.TruthBountyWeighted).toBeTruthy();
    expect(diagnostics.gitCommit).toMatch(/^[0-9a-f]{7,40}$/i);
    expect(diagnostics.gitCommit).not.toMatch(/^0+$/);
    expect(diagnostics.abiVersion).toBe('2.0.0');
    expect(diagnostics.abiHash).toMatch(/^[0-9a-f]{64}$/);
    expect(diagnostics.environment).toMatch(/^(production|development)$/);
    // Provenance only — never leak env secrets through diagnostics.
    expect(JSON.stringify(diagnostics)).not.toMatch(/api[_-]?key|secret|private[_-]?key|password/i);
  });
});
