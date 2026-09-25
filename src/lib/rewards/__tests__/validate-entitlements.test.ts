/**
 * Unit tests for reward entitlement validation — V2-FE-060
 *
 * Covers: valid payloads, malformed/fabrication-prone values, fail-closed
 * behavior, exact-amount aggregation, and allocation-category explanations.
 */

import {
  isBytes32Hex,
  summarizeRewardEntitlements,
  validateRewardEntitlement,
  validateRewardEntitlements,
} from '../validate-entitlements';
import {
  REWARD_ALLOCATION_CATEGORIES,
  REWARD_ALLOCATION_EXPLANATIONS,
} from '@/app/types/rewards';

const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';
const CLAIM_1 = `0x${'a'.repeat(64)}`;
const CLAIM_2 = `0x${'b'.repeat(64)}`;

function validEntitlement(overrides: Record<string, unknown> = {}) {
  return {
    claimId: CLAIM_1,
    category: 'verification_reward',
    amount: '1000000000000000000',
    asset: ADDR_A,
    decimals: 18,
    claimable: true,
    ...overrides,
  };
}

describe('isBytes32Hex', () => {
  it('accepts canonical bytes32 hex', () => {
    expect(isBytes32Hex(CLAIM_1)).toBe(true);
  });

  it('rejects wrong lengths, non-hex, and non-strings', () => {
    expect(isBytes32Hex('0x1234')).toBe(false);
    expect(isBytes32Hex(`0x${'g'.repeat(64)}`)).toBe(false);
    expect(isBytes32Hex('claim-1')).toBe(false);
    expect(isBytes32Hex(42)).toBe(false);
    expect(isBytes32Hex(null)).toBe(false);
  });
});

describe('validateRewardEntitlement', () => {
  it('accepts a fully valid entitlement', () => {
    const result = validateRewardEntitlement(validEntitlement());
    expect(result).not.toBeNull();
    expect(result?.claimId).toBe(CLAIM_1);
    expect(result?.amount).toBe(1_000_000_000_000_000_000n);
    expect(result?.asset).toBe(ADDR_A);
    expect(result?.category).toBe('verification_reward');
  });

  it('normalizes mixed-case asset addresses via checksum', () => {
    const result = validateRewardEntitlement(
      validEntitlement({ asset: ADDR_A.toUpperCase().replace('0X', '0x') }),
    );
    expect(result?.asset).toBe(ADDR_A);
  });

  it('fails closed on non-bytes32 claimId (fabrication guard)', () => {
    expect(
      validateRewardEntitlement(validEntitlement({ claimId: 'claim-1' })),
    ).toBeNull();
  });

  it('fails closed on float amounts (no client float math)', () => {
    expect(
      validateRewardEntitlement(validEntitlement({ amount: 1.5 })),
    ).toBeNull();
    expect(
      validateRewardEntitlement(validEntitlement({ amount: '1e18' })),
    ).toBeNull();
    expect(
      validateRewardEntitlement(validEntitlement({ amount: '1.5' })),
    ).toBeNull();
    expect(
      validateRewardEntitlement(validEntitlement({ amount: '-5' })),
    ).toBeNull();
  });

  it('fails closed on invalid asset addresses', () => {
    expect(
      validateRewardEntitlement(validEntitlement({ asset: 'not-an-address' })),
    ).toBeNull();
    expect(
      validateRewardEntitlement(validEntitlement({ asset: 123 })),
    ).toBeNull();
  });

  it('fails closed on unknown allocation categories', () => {
    expect(
      validateRewardEntitlement(
        validEntitlement({ category: 'mystery_bonus' }),
      ),
    ).toBeNull();
  });

  it('fails closed on out-of-range or non-integer decimals', () => {
    expect(validateRewardEntitlement(validEntitlement({ decimals: -1 }))).toBeNull();
    expect(validateRewardEntitlement(validEntitlement({ decimals: 37 }))).toBeNull();
    expect(validateRewardEntitlement(validEntitlement({ decimals: 1.5 }))).toBeNull();
    expect(validateRewardEntitlement(validEntitlement({ decimals: '18' }))).toBeNull();
  });

  it('fails closed on non-boolean claimable', () => {
    expect(
      validateRewardEntitlement(validEntitlement({ claimable: 'yes' })),
    ).toBeNull();
  });

  it('fails closed on null, primitives, and empty objects', () => {
    expect(validateRewardEntitlement(null)).toBeNull();
    expect(validateRewardEntitlement('entitlement')).toBeNull();
    expect(validateRewardEntitlement(42)).toBeNull();
    expect(validateRewardEntitlement({})).toBeNull();
  });
});

describe('validateRewardEntitlements', () => {
  it('validates an entire payload and reports rejected entries', () => {
    const payload = [
      validEntitlement(),
      { garbage: true },
      validEntitlement({ claimId: CLAIM_2, amount: '500', decimals: 6 }),
    ];
    const result = validateRewardEntitlements(payload);
    expect(result.entitlements).toHaveLength(2);
    expect(result.rejectedCount).toBe(1);
    expect(result.rejectionReasons).toHaveLength(1);
  });

  it('fails closed when the payload is not an array', () => {
    expect(validateRewardEntitlements({})).toEqual({
      entitlements: [],
      rejectedCount: 1,
      rejectionReasons: ['Entitlement payload is not an array'],
    });
    expect(validateRewardEntitlements(null)).toEqual({
      entitlements: [],
      rejectedCount: 1,
      rejectionReasons: ['Entitlement payload is not an array'],
    });
  });

  it('returns empty (not coerced) entitlements for an all-invalid payload', () => {
    const result = validateRewardEntitlements([
      { claimId: 'x' },
      17,
      undefined,
    ]);
    expect(result.entitlements).toHaveLength(0);
    expect(result.rejectedCount).toBe(3);
  });

  it('rejects duplicate claim ids and conflicting decimals for one asset', () => {
    const result = validateRewardEntitlements([
      validEntitlement(),
      validEntitlement({ amount: '2' }),
      validEntitlement({ claimId: CLAIM_2, decimals: 6 }),
    ]);

    expect(result.entitlements).toEqual([
      expect.objectContaining({ claimId: CLAIM_1 }),
    ]);
    expect(result.rejectedCount).toBe(2);
    expect(result.rejectionReasons).toEqual([
      expect.stringContaining('Duplicate entitlement claim id'),
      expect.stringContaining('Inconsistent asset decimals'),
    ]);
  });
});

describe('summarizeRewardEntitlements', () => {
  it('aggregates exact bigint totals per asset without float drift', () => {
    const [first, second] = validateRewardEntitlements([
      validEntitlement({ amount: '1000000000000000000' }),
      validEntitlement({
        claimId: CLAIM_2,
        amount: '250000000000000000',
      }),
    ]).entitlements;

    const summary = summarizeRewardEntitlements([first, second]);
    expect(summary.claimableByAsset).toHaveLength(1);
    expect(summary.claimableByAsset[0].totalAmount).toBe(
      1_250_000_000_000_000_000n,
    );
    expect(summary.hasClaimable).toBe(true);
  });

  it('groups multiple assets deterministically', () => {
    const entitlements = validateRewardEntitlements([
      validEntitlement({ asset: ADDR_B, amount: '10', decimals: 6 }),
      validEntitlement({ asset: ADDR_A, amount: '20' }),
    ]).entitlements;

    const summary = summarizeRewardEntitlements(entitlements);
    expect(summary.claimableByAsset.map((g) => g.asset)).toEqual([
      ADDR_A,
      ADDR_B,
    ]);
  });

  it('excludes non-claimable entitlements from claimable groups', () => {
    const entitlements = validateRewardEntitlements([
      validEntitlement({ claimable: false, amount: '999' }),
    ]).entitlements;

    const summary = summarizeRewardEntitlements(entitlements);
    expect(summary.claimableByAsset).toHaveLength(0);
    expect(summary.hasClaimable).toBe(false);
    expect(summary.entitlements).toHaveLength(1);
  });

  it('collects allocation categories for explanations', () => {
    const entitlements = validateRewardEntitlements([
      validEntitlement({ category: 'verification_reward' }),
      validEntitlement({ claimId: CLAIM_2, category: 'stake_winnings' }),
    ]).entitlements;

    const summary = summarizeRewardEntitlements(entitlements);
    const categories = Array.from(summary.claimableByAsset[0].categories);
    expect(categories).toContain('verification_reward');
    expect(categories).toContain('stake_winnings');
  });
});

describe('allocation categories', () => {
  it('exposes an explanation for every category (no unexplained payouts)', () => {
    for (const category of REWARD_ALLOCATION_CATEGORIES) {
      expect(REWARD_ALLOCATION_EXPLANATIONS[category]).toBeTruthy();
    }
  });
});
