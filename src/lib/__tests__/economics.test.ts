/**
 * Economic disclosure helpers (V2-FE-116).
 *
 * Asserts the pure derivations read CANONICAL release parameters, format
 * amounts without rounding, and fail closed (unknown/insufficient) rather than
 * assuming an allowance or balance is sufficient.
 */

import {
  bpsToPercent,
  formatDurationSeconds,
  formatTokenAmount,
  getAllowanceStatus,
  getBondAffordability,
  getCanonicalEconomicParameters,
} from '@/lib/economics';

describe('getCanonicalEconomicParameters', () => {
  it('reads the canonical release parameters', () => {
    const params = getCanonicalEconomicParameters();
    expect(params).not.toBeNull();
    expect(params?.chainId).toBe(11155420);
    expect(params?.minBondWei).toBe(1000000000000000000n);
    expect(params?.protocolFeeBps).toBe(100);
    expect(params?.appealWindowSeconds).toBe(604800);
  });
});

describe('formatTokenAmount', () => {
  it('formats wei with the default 18 decimals', () => {
    expect(formatTokenAmount(1000000000000000000n)).toBe('1');
    expect(formatTokenAmount(1500000000000000000n)).toBe('1.5');
  });

  it('honours explicit decimals', () => {
    expect(formatTokenAmount(1000000n, 6)).toBe('1');
  });

  it('does not round away precision', () => {
    expect(formatTokenAmount(1n, 18)).toBe('0.000000000000000001');
  });
});

describe('bpsToPercent', () => {
  it('renders whole percentages without decimals', () => {
    expect(bpsToPercent(100)).toBe('1%');
    expect(bpsToPercent(0)).toBe('0%');
  });

  it('renders fractional percentages with two decimals', () => {
    expect(bpsToPercent(250)).toBe('2.50%');
    expect(bpsToPercent(125)).toBe('1.25%');
  });
});

describe('formatDurationSeconds', () => {
  it('formats the canonical appeal window', () => {
    expect(formatDurationSeconds(604800)).toBe('7 days');
  });

  it('formats composite durations', () => {
    expect(formatDurationSeconds(3661)).toBe('1 hour, 1 minute');
  });

  it('handles zero and singular units', () => {
    expect(formatDurationSeconds(0)).toBe('0 seconds');
    expect(formatDurationSeconds(1)).toBe('1 second');
    expect(formatDurationSeconds(86400)).toBe('1 day');
  });

  it('fails closed on invalid input', () => {
    expect(formatDurationSeconds(-1)).toBe('Unknown');
    expect(formatDurationSeconds(Number.NaN)).toBe('Unknown');
  });
});

describe('getAllowanceStatus', () => {
  it('reports unknown for a missing allowance (fail closed)', () => {
    expect(getAllowanceStatus(null, 10n)).toBe('unknown');
    expect(getAllowanceStatus(undefined, 10n)).toBe('unknown');
  });

  it('compares against the required amount', () => {
    expect(getAllowanceStatus(10n, 10n)).toBe('sufficient');
    expect(getAllowanceStatus(11n, 10n)).toBe('sufficient');
    expect(getAllowanceStatus(9n, 10n)).toBe('insufficient');
  });
});

describe('getBondAffordability', () => {
  it('reports unknown for a missing balance (fail closed)', () => {
    expect(getBondAffordability(null, 10n)).toBe('unknown');
    expect(getBondAffordability(undefined, 10n)).toBe('unknown');
  });

  it('compares balance against the bond', () => {
    expect(getBondAffordability(10n, 10n)).toBe('affordable');
    expect(getBondAffordability(9n, 10n)).toBe('insufficient');
  });
});
