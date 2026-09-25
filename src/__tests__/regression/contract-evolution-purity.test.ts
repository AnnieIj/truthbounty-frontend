/**
 * V2-FE-088 — Regression: mocks / placeholders must not enter the production
 * ABI or release manifest consumed by the component contract surface.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  getPinnedContractSnapshot,
  validateAbiSurface,
  validateEventSchema,
  validateManifestVersions,
} from '@/lib/contracts/contract-evolution';

const ROOT = path.resolve(__dirname, '../../..');
const RELEASE = path.join(ROOT, 'release');

describe('V2-FE-088 production artifact purity', () => {
  it('release ABI and event schema pass contract validation', () => {
    const snapshot = getPinnedContractSnapshot();
    expect(validateAbiSurface(snapshot.abi)).toEqual([]);
    expect(validateEventSchema(snapshot.events)).toEqual([]);
    expect(
      validateManifestVersions(snapshot.manifest, {
        protocolVersion: '2.0.0',
        abiVersion: '2.0.0',
        eventSchemaVersion: '2.0.0',
      }),
    ).toEqual([]);
  });

  it('release JSON on disk contains no mock/placeholder/dummy tokens', () => {
    const tracked = [
      'manifest.json',
      'abi/TruthBountyWeighted.json',
      'events/event-schema.json',
      'addresses/11155420.json',
    ];
    const forbidden = /placeholder|dummy|mockaddress|yourcontract/i;
    for (const rel of tracked) {
      const text = fs.readFileSync(path.join(RELEASE, rel), 'utf8');
      expect(forbidden.test(text)).toBe(false);
    }
  });

  it('contract-evolution helpers are not imported from app routes with fabrications', () => {
    // Guard: production registry still re-exports only real release imports.
    const registry = fs.readFileSync(
      path.join(ROOT, 'src/lib/contracts/registry.ts'),
      'utf8',
    );
    expect(registry).toMatch(/from '\.\.\/\.\.\/\.\.\/release\/manifest\.json'/);
    expect(registry).not.toMatch(/fabricat|simulateReceipt|fakeTxHash/i);
  });
});
