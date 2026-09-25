import {
  FEATURE_FLAG_KEYS,
  FLAG_METADATA,
  DEFAULT_FLAGS,
  assertFailClosedInvariants,
  evaluateFlag,
  getInitialFlags,
  isFeatureFlag,
  isFlagEnabled,
  resolveFlagEnvironment,
  type FeatureFlag,
} from '../feature-flags';

describe('Typed fail-closed feature flags (V2-FE-083)', () => {
  it('defines owner, environments, default, expiry, and safeFallback for every flag', () => {
    for (const key of FEATURE_FLAG_KEYS) {
      const meta = FLAG_METADATA[key];
      expect(meta.name).toBe(key);
      expect(typeof meta.owner).toBe('string');
      expect(meta.owner.length).toBeGreaterThan(0);
      expect(Array.isArray(meta.environments)).toBe(true);
      expect(meta.environments.length).toBeGreaterThan(0);
      expect(typeof meta.defaultValue).toBe('boolean');
      expect(meta.defaultValue).toBe(DEFAULT_FLAGS[key]);
      expect(meta.safeFallback).toBe(false);
      expect(
        meta.expiresAt === null || typeof meta.expiresAt === 'string'
      ).toBe(true);
      expect(typeof meta.protocolInvariantProtected).toBe('boolean');
    }
  });

  it('enforces fail-closed invariants for protocol-protected flags', () => {
    expect(() => assertFailClosedInvariants()).not.toThrow();
  });

  it('treats unknown flag names as disabled (fail closed)', () => {
    const result = evaluateFlag('NOT_A_REAL_FLAG', true);
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('unknown_flag');
    expect(result.usedFallback).toBe(true);
    expect(isFeatureFlag('NOT_A_REAL_FLAG')).toBe(false);
    expect(isFeatureFlag('CLAIM_SUBMISSION')).toBe(true);
  });

  it('fails closed when a flag is expired', () => {
    const result = evaluateFlag('BETA_FEATURES', true, {
      environment: 'development',
      now: new Date('2030-01-01T00:00:00.000Z'),
    });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('expired');
    expect(result.usedFallback).toBe(true);
  });

  it('fails closed when environment is not allowed', () => {
    const result = evaluateFlag('BETA_FEATURES', true, {
      environment: 'production',
      now: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('environment_mismatch');
  });

  it('allows beta features in development before expiry', () => {
    const result = evaluateFlag('BETA_FEATURES', true, {
      environment: 'development',
      now: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(result.enabled).toBe(true);
    expect(result.reason).toBe('enabled');
  });

  it('forbids flags from bypassing protocol/security invariants', () => {
    const result = evaluateFlag('CLAIM_SUBMISSION', true, {
      protocolBypassAttempt: true,
    });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('protocol_invariant');
  });

  it('fails closed on unsupported chain for protocol-protected flags', () => {
    const result = evaluateFlag('WALLET_CONNECTION', true, {
      chainId: 1, // Ethereum mainnet — not Optimism
    });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('unsupported_chain');
  });

  it('allows protocol-protected flags on Optimism when otherwise enabled', () => {
    expect(
      isFlagEnabled('WALLET_CONNECTION', true, { chainId: 10 })
    ).toBe(true);
    expect(
      isFlagEnabled('WALLET_CONNECTION', true, { chainId: 11155420 })
    ).toBe(true);
  });

  it('fails closed on missing session, allowance, contract, or ABI', () => {
    expect(
      evaluateFlag('CLAIM_SUBMISSION', true, { hasValidSession: false }).reason
    ).toBe('missing_session');
    expect(
      evaluateFlag('CLAIM_SUBMISSION', true, { hasValidAllowance: false })
        .reason
    ).toBe('missing_allowance');
    expect(
      evaluateFlag('CLAIM_SUBMISSION', true, {
        contractAddressConfigured: false,
      }).reason
    ).toBe('missing_contract');
    expect(
      evaluateFlag('CLAIM_SUBMISSION', true, { abiConfigured: false }).reason
    ).toBe('missing_abi');
  });

  it('returns disabled (not fallback) when flag value is explicitly false', () => {
    const result = evaluateFlag('LEADERBOARD', false);
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(result.usedFallback).toBe(false);
  });

  it('getInitialFlags applies fail-closed evaluation', () => {
    const flags = getInitialFlags({
      environment: 'production',
      now: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(flags.BETA_FEATURES).toBe(false);
    expect(flags.CLAIM_SUBMISSION).toBe(true);
    // every key present
    for (const key of FEATURE_FLAG_KEYS) {
      expect(typeof flags[key as FeatureFlag]).toBe('boolean');
    }
  });

  it('resolveFlagEnvironment maps NODE_ENV safely', () => {
    expect(resolveFlagEnvironment('staging')).toBe('staging');
  });

  describe('loading / empty / success / rejection / error / recovery', () => {
    it('loading: undefined raw value uses metadata default then guards', () => {
      const ok = evaluateFlag('LEADERBOARD', undefined);
      expect(ok.enabled).toBe(true);
      expect(ok.reason).toBe('enabled');
    });

    it('empty: unknown input rejects closed', () => {
      expect(evaluateFlag('', undefined).enabled).toBe(false);
    });

    it('success: known enabled flag passes', () => {
      expect(evaluateFlag('NOTIFICATION_BELL', true).enabled).toBe(true);
    });

    it('rejection: protocol bypass rejected', () => {
      expect(
        evaluateFlag('CLAIM_VERIFICATION', true, {
          protocolBypassAttempt: true,
        }).enabled
      ).toBe(false);
    });

    it('error: invalid expiry timestamp fails closed', () => {
      const original = FLAG_METADATA.ADVANCED_FILTERS.expiresAt;
      // mutate temporarily — restore after
      (FLAG_METADATA.ADVANCED_FILTERS as { expiresAt: string | null }).expiresAt =
        'not-a-date';
      try {
        const result = evaluateFlag('ADVANCED_FILTERS', true);
        expect(result.enabled).toBe(false);
        expect(result.reason).toBe('expired');
      } finally {
        (FLAG_METADATA.ADVANCED_FILTERS as { expiresAt: string | null }).expiresAt =
          original;
      }
    });

    it('recovery: clearing guard context restores enablement', () => {
      const blocked = evaluateFlag('CLAIM_SUBMISSION', true, {
        chainId: 999,
      });
      expect(blocked.enabled).toBe(false);
      const recovered = evaluateFlag('CLAIM_SUBMISSION', true, {
        chainId: 10,
      });
      expect(recovered.enabled).toBe(true);
    });
  });
});
