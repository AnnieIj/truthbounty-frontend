import {
  deriveDeadlineFromBlocks,
  formatBlockContext,
  formatDeadlineContext,
  isDeadlineExpired,
  isDeadlineWithinHorizon,
  normalizeBlockNumber,
  parseBlockTimestampMs,
  parseTimestampMs,
  resolveDeadlineState,
  type BlockDeadlineProjection,
} from '@/app/lib/protocol-time';

const ANCHOR_TS_MS = 1_700_000_000_000;

describe('normalizeBlockNumber', () => {
  it('normalizes bigint, number, and numeric string block numbers', () => {
    expect(normalizeBlockNumber(1000n)).toBe(1000n);
    expect(normalizeBlockNumber(1000)).toBe(1000n);
    expect(normalizeBlockNumber('1000')).toBe(1000n);
  });

  it('returns null for empty/missing input', () => {
    expect(normalizeBlockNumber(null)).toBeNull();
    expect(normalizeBlockNumber(undefined)).toBeNull();
  });

  it('returns null for non-integer, negative, and garbage input', () => {
    expect(normalizeBlockNumber(1000.5)).toBeNull();
    expect(normalizeBlockNumber(-1)).toBeNull();
    expect(normalizeBlockNumber('abc')).toBeNull();
    expect(normalizeBlockNumber('1.5')).toBeNull();
    expect(normalizeBlockNumber(Number.NaN)).toBeNull();
    expect(normalizeBlockNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('parseTimestampMs', () => {
  it('parses millisecond epoch values', () => {
    expect(parseTimestampMs(ANCHOR_TS_MS)).toBe(ANCHOR_TS_MS);
    expect(parseTimestampMs(new Date(ANCHOR_TS_MS))).toBe(ANCHOR_TS_MS);
    expect(parseTimestampMs(String(ANCHOR_TS_MS))).toBe(ANCHOR_TS_MS);
    expect(parseTimestampMs('2023-11-14T22:13:20.000Z')).toBe(ANCHOR_TS_MS);
  });

  it('returns null for empty and invalid input', () => {
    expect(parseTimestampMs(null)).toBeNull();
    expect(parseTimestampMs(undefined)).toBeNull();
    expect(parseTimestampMs('')).toBeNull();
    expect(parseTimestampMs('not-a-date')).toBeNull();
    expect(parseTimestampMs(Number.NaN)).toBeNull();
    expect(parseTimestampMs(-5)).toBeNull();
  });

  it('rejects ambiguous second-epoch strings (must use parseBlockTimestampMs)', () => {
    expect(parseTimestampMs('1700000000')).toBeNull();
  });
});

describe('parseBlockTimestampMs', () => {
  it('converts chain seconds to milliseconds', () => {
    expect(parseBlockTimestampMs(1_700_000_000)).toBe(ANCHOR_TS_MS);
    expect(parseBlockTimestampMs('1700000000')).toBe(ANCHOR_TS_MS);
  });

  it('returns null for empty/invalid/ambiguous input', () => {
    expect(parseBlockTimestampMs(null)).toBeNull();
    expect(parseBlockTimestampMs(undefined)).toBeNull();
    expect(parseBlockTimestampMs('')).toBeNull();
    expect(parseBlockTimestampMs(-1)).toBeNull();
    expect(parseBlockTimestampMs(Number.NaN)).toBeNull();
    expect(parseBlockTimestampMs(true)).toBeNull();
  });
});

describe('deriveDeadlineFromBlocks', () => {
  it('projects a deadline from canonical chain data', () => {
    const result = deriveDeadlineFromBlocks(
      {
        anchorBlockNumber: 1000n,
        anchorBlockTimestampMs: ANCHOR_TS_MS,
        avgBlockSeconds: 2,
      },
      1005
    );

    expect(result.deadlineMs).toBe(ANCHOR_TS_MS + 5 * 2 * 1000);
    expect(result.blockDelta).toBe(5);
    expect(result.projectBlockNumber).toBe(1005n);
    expect(result.anchorBlockNumber).toBe(1000n);
    expect(result.avgBlockSeconds).toBe(2);
  });

  it('accepts string and numeric anchors and targets', () => {
    const result = deriveDeadlineFromBlocks(
      {
        anchorBlockNumber: '1000',
        anchorBlockTimestampMs: String(ANCHOR_TS_MS),
        avgBlockSeconds: '2',
      },
      '1005'
    );

    expect(result.deadlineMs).toBe(ANCHOR_TS_MS + 10_000);
    expect(result.projectBlockNumber).toBe(1005n);
  });

  it('treats a target at or before the anchor as already met (blockDelta 0)', () => {
    const atAnchor = deriveDeadlineFromBlocks(
      { anchorBlockNumber: 1000, anchorBlockTimestampMs: ANCHOR_TS_MS, avgBlockSeconds: 2 },
      1000
    );
    expect(atAnchor.deadlineMs).toBe(ANCHOR_TS_MS);
    expect(atAnchor.blockDelta).toBe(0);

    const beforeAnchor = deriveDeadlineFromBlocks(
      { anchorBlockNumber: 1000, anchorBlockTimestampMs: ANCHOR_TS_MS, avgBlockSeconds: 2 },
      999
    );
    expect(beforeAnchor.deadlineMs).toBe(ANCHOR_TS_MS);
    expect(beforeAnchor.blockDelta).toBe(0);
  });

  it('fails closed (null) when the target block is invalid', () => {
    const result = deriveDeadlineFromBlocks(
      { anchorBlockNumber: 1000, anchorBlockTimestampMs: ANCHOR_TS_MS, avgBlockSeconds: 2 },
      null
    );
    expect(result.deadlineMs).toBeNull();
    expect(result.blockDelta).toBeNull();
  });

  it('fails closed (null) when the anchor block is invalid', () => {
    const result = deriveDeadlineFromBlocks(
      { anchorBlockNumber: null, anchorBlockTimestampMs: ANCHOR_TS_MS, avgBlockSeconds: 2 },
      1005
    );
    expect(result.deadlineMs).toBeNull();
  });

  it('fails closed (null) when the anchor timestamp is missing', () => {
    const result = deriveDeadlineFromBlocks(
      { anchorBlockNumber: 1000, anchorBlockTimestampMs: null, avgBlockSeconds: 2 },
      1005
    );
    expect(result.deadlineMs).toBeNull();
    expect(result.avgBlockSeconds).toBeNull();
  });

  it('fails closed (null) on an invalid block interval and recovers cleanly', () => {
    const noInterval = deriveDeadlineFromBlocks(
      { anchorBlockNumber: 1000, anchorBlockTimestampMs: ANCHOR_TS_MS, avgBlockSeconds: null },
      1005
    );
    expect(noInterval.deadlineMs).toBeNull();

    const zeroInterval = deriveDeadlineFromBlocks(
      { anchorBlockNumber: 1000, anchorBlockTimestampMs: ANCHOR_TS_MS, avgBlockSeconds: 0 },
      1005
    );
    expect(zeroInterval.deadlineMs).toBeNull();
    expect(zeroInterval.projectBlockNumber).toBe(1005n);
  });
});

describe('isDeadlineExpired', () => {
  it('returns null (fail closed) when the deadline is unknown', () => {
    expect(isDeadlineExpired({ deadlineMs: null, nowMs: 100 })).toBeNull();
    expect(isDeadlineExpired({ deadlineMs: undefined, nowMs: 100 })).toBeNull();
    expect(isDeadlineExpired({ deadlineMs: Number.NaN, nowMs: 100 })).toBeNull();
  });

  it('treats the exact boundary (deadline === now) as expired', () => {
    expect(isDeadlineExpired({ deadlineMs: 1000, nowMs: 1000 })).toBe(true);
    expect(isDeadlineExpired({ deadlineMs: 1001, nowMs: 1000 })).toBe(false);
    expect(isDeadlineExpired({ deadlineMs: 999, nowMs: 1000 })).toBe(true);
  });

  it('applies a clock-skew tolerance so a slightly-ahead client does not prematurely expire', () => {
    expect(isDeadlineExpired({ deadlineMs: 1005, nowMs: 1000, clockSkewMs: 10 })).toBe(true);
    expect(isDeadlineExpired({ deadlineMs: 1011, nowMs: 1000, clockSkewMs: 10 })).toBe(false);
    expect(isDeadlineExpired({ deadlineMs: 1010, nowMs: 1000, clockSkewMs: 10 })).toBe(true);
  });

  it('ignores a negative/invalid skew (treated as zero)', () => {
    expect(isDeadlineExpired({ deadlineMs: 1000, nowMs: 999, clockSkewMs: -5 })).toBe(false);
  });
});

describe('isDeadlineWithinHorizon', () => {
  it('returns true when a live deadline sits inside the horizon window', () => {
    const nowMs = 1_000;
    expect(
      isDeadlineWithinHorizon({ deadlineMs: nowMs + 5, nowMs, horizonMs: 10 })
    ).toBe(true);
  });

  it('returns false when a live deadline is beyond the horizon', () => {
    const nowMs = 1_000;
    expect(
      isDeadlineWithinHorizon({ deadlineMs: nowMs + 11, nowMs, horizonMs: 10 })
    ).toBe(false);
  });

  it('never reports a past deadline as "expiring soon"', () => {
    expect(
      isDeadlineWithinHorizon({ deadlineMs: 900, nowMs: 1000, horizonMs: 10 })
    ).toBe(false);
  });

  it('fails closed on unknown deadlines or invalid horizons', () => {
    expect(
      isDeadlineWithinHorizon({ deadlineMs: null, nowMs: 1000, horizonMs: 10 })
    ).toBeNull();
    expect(
      isDeadlineWithinHorizon({ deadlineMs: 1100, nowMs: 1000, horizonMs: -1 })
    ).toBeNull();
  });

  it('treats the horizon boundary as included', () => {
    expect(
      isDeadlineWithinHorizon({ deadlineMs: 1010, nowMs: 1000, horizonMs: 10 })
    ).toBe(true);
  });
});

describe('resolveDeadlineState', () => {
  it('derives ACTIVE / EXPIRED from the canonical deadline', () => {
    const nowMs = 1_000;
    expect(resolveDeadlineState({ deadlineMs: 2_000, nowMs })).toBe('ACTIVE');
    expect(resolveDeadlineState({ deadlineMs: 999, nowMs })).toBe('EXPIRED');
    expect(resolveDeadlineState({ deadlineMs: 1_000, nowMs })).toBe('EXPIRED');
  });

  it('resolves unknown deadlines to UNKNOWN (never guessed)', () => {
    expect(resolveDeadlineState({ deadlineMs: null, nowMs: 1_000 })).toBe('UNKNOWN');
    expect(resolveDeadlineState({ deadlineMs: undefined, nowMs: 1_000 })).toBe('UNKNOWN');
  });

  it('lets a confirmed canonical expiry status win over clock math', () => {
    const nowMs = 1_000;
    expect(
      resolveDeadlineState({ deadlineMs: 2_000, nowMs, canonicallyExpired: true })
    ).toBe('EXPIRED');
  });

  it('applies clock-skew tolerance in state resolution', () => {
    const nowMs = 1_000;
    expect(resolveDeadlineState({ deadlineMs: 1_005, nowMs, clockSkewMs: 10 })).toBe('EXPIRED');
  });
});

describe('formatBlockContext and formatDeadlineContext', () => {
  const projection: BlockDeadlineProjection = {
    deadlineMs: ANCHOR_TS_MS,
    blockDelta: 5,
    projectBlockNumber: 1005n,
    anchorBlockNumber: 1000n,
    avgBlockSeconds: 2,
  };

  it('builds a block context label from the projection', () => {
    expect(formatBlockContext(projection)).toBe('by block 1005 (+5)');

    const met: BlockDeadlineProjection = { ...projection, blockDelta: 0 };
    expect(formatBlockContext(met)).toBe('by block 1005');
  });

  it('returns null (fail closed) when the projection block is unknown', () => {
    expect(formatBlockContext({ ...projection, projectBlockNumber: null })).toBeNull();
  });

  it('formats local time with absolute UTC and block context', () => {
    const label = formatDeadlineContext({
      deadlineMs: ANCHOR_TS_MS,
      blockContext: formatBlockContext(projection),
    });

    expect(label).not.toBeNull();
    expect(label).toContain('UTC');
    expect(label).toContain('by block 1005 (+5)');
  });

  it('fails closed (null) on an unknown deadline', () => {
    expect(formatDeadlineContext({ deadlineMs: null })).toBeNull();
    expect(formatDeadlineContext({ deadlineMs: undefined })).toBeNull();
    expect(formatDeadlineContext({ deadlineMs: Number.NaN })).toBeNull();
  });
});