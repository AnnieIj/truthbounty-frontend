/**
 * V2-FE-088 — Contract tests for API and ABI evolution.
 *
 * Covers: generated ABI surface, event fields, manifests, enums/error codes,
 * versioned fixtures, backward-compatible mapping, and fail-closed recovery.
 */
import abiSurfaceFixture from '../__fixtures__/abi-surface.v2.0.0.json';
import apiV2 from '../__fixtures__/api-projections.v2.0.0.json';
import apiV1 from '../__fixtures__/api-projections.v1.legacy.json';
import {
  REQUIRED_ABI_FUNCTIONS_V2,
  REQUIRED_EVENT_NAMES_V2,
  CLAIM_STATUSES_V2,
  CLAIM_CREATION_ERROR_CODES_V2,
  SETTLEMENT_STATES_V2,
  validateAbiSurface,
  validateEventSchema,
  validateManifestVersions,
  validateApiProjection,
  mapLegacyClaimStatus,
  claimStatusLabel,
  asyncStateFeedback,
  getPinnedContractSnapshot,
  isKnownClaimStatus,
  isKnownErrorCode,
  type ApiProjectionFixture,
} from '../contract-evolution';

describe('V2-FE-088 ABI / manifest contract', () => {
  const snapshot = getPinnedContractSnapshot();

  it('pins protocol 2.0.0 with matching abi and event schema versions', () => {
    const issues = validateManifestVersions(snapshot.manifest, {
      protocolVersion: '2.0.0',
      abiVersion: '2.0.0',
      eventSchemaVersion: '2.0.0',
    });
    expect(issues).toEqual([]);
    expect(snapshot.manifest.chainId).toBe(11155420);
  });

  it('keeps the required TruthBountyWeighted ABI surface', () => {
    expect(abiSurfaceFixture.version).toBe('2.0.0');
    expect(abiSurfaceFixture.requiredFunctions).toEqual([
      ...REQUIRED_ABI_FUNCTIONS_V2,
    ]);

    const issues = validateAbiSurface(snapshot.abi);
    expect(issues).toEqual([]);

    for (const name of REQUIRED_ABI_FUNCTIONS_V2) {
      expect(
        snapshot.abi.some(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            (item as { type?: string; name?: string }).type === 'function' &&
            (item as { name?: string }).name === name,
        ),
      ).toBe(true);
    }
  });

  it('rejects an evolved ABI that drops claimRewards', () => {
    const broken = snapshot.abi.filter(
      (item) =>
        !(
          typeof item === 'object' &&
          item !== null &&
          (item as { name?: string }).name === 'claimRewards'
        ),
    );
    const issues = validateAbiSurface(broken);
    expect(issues.some((i) => i.code === 'MISSING_ABI_FUNCTION')).toBe(true);
  });

  it('rejects mutation functions silently changed to view', () => {
    const mutated = snapshot.abi.map((item) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        (item as { name?: string }).name === 'finalize'
      ) {
        return { ...(item as object), stateMutability: 'view' };
      }
      return item;
    });
    const issues = validateAbiSurface(mutated);
    expect(issues.some((i) => i.code === 'UNEXPECTED_VIEW_MUTATION')).toBe(true);
  });

  it('rejects placeholder tokens inside ABI JSON', () => {
    const poisoned = [
      ...snapshot.abi,
      {
        type: 'function',
        name: 'placeholderClaim',
        stateMutability: 'nonpayable',
        inputs: [],
        outputs: [],
      },
    ];
    const issues = validateAbiSurface(poisoned);
    expect(issues.some((i) => i.code === 'PLACEHOLDER_IN_ABI')).toBe(true);
  });

  it('requires ClaimSettled and RewardsClaimed event fields', () => {
    expect(REQUIRED_EVENT_NAMES_V2).toEqual(
      abiSurfaceFixture.requiredEvents.map((e) => e.name),
    );
    const issues = validateEventSchema(snapshot.events);
    expect(issues).toEqual([]);
    for (const expected of abiSurfaceFixture.requiredEvents) {
      const found = snapshot.events.events.find((e) => e.name === expected.name);
      expect(found?.signature).toBe(expected.signature);
    }
  });
});

describe('V2-FE-088 API projection enums and error codes', () => {
  it('accepts the v2.0.0 API projection fixture', () => {
    const issues = validateApiProjection(apiV2 as ApiProjectionFixture);
    expect(issues).toEqual([]);
    expect(apiV2.version).toBe('2.0.0');
  });

  it('enumerates every ClaimStatus / SettlementState / error code', () => {
    expect(CLAIM_STATUSES_V2).toContain('OPEN');
    expect(CLAIM_STATUSES_V2).toContain('DISPUTED');
    expect(SETTLEMENT_STATES_V2).toContain('FINALIZED');
    expect(CLAIM_CREATION_ERROR_CODES_V2).toContain('USER_REJECTED');
    expect(isKnownClaimStatus('VERIFIED')).toBe(true);
    expect(isKnownClaimStatus('QUEUED')).toBe(false);
    expect(isKnownErrorCode('SIMULATION_REVERTED')).toBe(true);
  });

  it('fails closed on unknown enums in a projection', () => {
    const bad: ApiProjectionFixture = {
      ...(apiV2 as ApiProjectionFixture),
      claims: [
        {
          ...(apiV2.claims[0] as ApiProjectionFixture['claims'][0]),
          status: 'QUEUED' as ApiProjectionFixture['claims'][0]['status'],
        },
      ],
    };
    const issues = validateApiProjection(bad);
    expect(issues.some((i) => i.code === 'UNKNOWN_ENUM')).toBe(true);
  });

  it('maps legacy status aliases and fails closed on unknown legacy values', () => {
    expect(mapLegacyClaimStatus('IN_REVIEW')).toBe('UNDER_REVIEW');
    expect(mapLegacyClaimStatus('approved')).toBe('VERIFIED');
    expect(mapLegacyClaimStatus('QUEUED')).toBeNull();

    const legacy = apiV1 as {
      claims: { id: string; status: string }[];
    };
    const mapped = legacy.claims.map((c) => ({
      id: c.id,
      mapped: mapLegacyClaimStatus(c.status),
    }));
    expect(mapped).toEqual([
      { id: 'legacy-1', mapped: 'UNDER_REVIEW' },
      { id: 'legacy-2', mapped: null },
    ]);
  });

  it('provides stable status labels for backward-compatible rendering', () => {
    expect(claimStatusLabel('UNDER_REVIEW')).toBe('Under review');
    expect(claimStatusLabel('VERIFIED')).toBe('Verified');
  });
});

describe('V2-FE-088 async state feedback (a11y contract)', () => {
  it.each([
    ['loading', 'status'],
    ['empty', 'status'],
    ['success', 'status'],
    ['rejection', 'alert'],
    ['error', 'alert'],
    ['recovery', 'status'],
  ] as const)('%s exposes role=%s with actionable copy', (state, role) => {
    const feedback = asyncStateFeedback(state);
    expect(feedback.role).toBe(role);
    expect(feedback.message.length).toBeGreaterThan(10);
  });
});
