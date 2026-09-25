import {
  createIdlePerformanceState,
  isBudgetMeasurementStale,
  isPerformanceBudgetTerminal,
  PerformanceBudgetError,
  transitionPerformanceBudget,
} from '@/lib/performance/budget-state';

const IDLE = createIdlePerformanceState();

describe('performance budget state machine', () => {
  it('starts with an idle state and no metrics', () => {
    expect(IDLE).toEqual({
      status: 'idle',
      metrics: {},
      violations: [],
      measuredAt: null,
      error: null,
    });
  });

  it('START moves idle → measuring', () => {
    const next = transitionPerformanceBudget(IDLE, { type: 'START' });
    expect(next.status).toBe('measuring');
  });

  it('UNSUPPORTED moves idle → unsupported', () => {
    const next = transitionPerformanceBudget(IDLE, {
      type: 'UNSUPPORTED',
      reason: 'no observer',
    });
    expect(next.status).toBe('unsupported');
    expect(next.error).toBe('no observer');
  });

  it('records metrics while measuring', () => {
    let state = transitionPerformanceBudget(IDLE, { type: 'START' });
    state = transitionPerformanceBudget(state, {
      type: 'METRIC',
      name: 'LCP',
      value: 1200,
      measuredAt: 1000,
    });
    expect(state.status).toBe('measuring');
    expect(state.metrics).toEqual({ LCP: 1200 });
    expect(state.measuredAt).toBe(1000);
  });

  it('rejects non-finite metric values (fails closed)', () => {
    const state = transitionPerformanceBudget(IDLE, { type: 'START' });
    expect(() =>
      transitionPerformanceBudget(state, {
        type: 'METRIC',
        name: 'LCP',
        value: Number.NaN,
        measuredAt: 1000,
      }),
    ).toThrow(PerformanceBudgetError);
    expect(() =>
      transitionPerformanceBudget(state, {
        type: 'METRIC',
        name: 'LCP',
        value: Infinity,
        measuredAt: 1000,
      }),
    ).toThrow(PerformanceBudgetError);
  });

  it('END with metrics within budget resolves within-budget', () => {
    let state = transitionPerformanceBudget(IDLE, { type: 'START' });
    state = transitionPerformanceBudget(state, {
      type: 'METRIC',
      name: 'LCP',
      value: 1200,
      measuredAt: 1000,
    });
    const final = transitionPerformanceBudget(state, { type: 'END', endedAt: 5000 });
    expect(final.status).toBe('within-budget');
    expect(final.violations).toEqual([]);
  });

  it('END with a breached metric resolves over-budget with the violation', () => {
    let state = transitionPerformanceBudget(IDLE, { type: 'START' });
    state = transitionPerformanceBudget(state, {
      type: 'METRIC',
      name: 'INP',
      value: 3000,
      measuredAt: 1000,
    });
    const final = transitionPerformanceBudget(state, { type: 'END', endedAt: 5000 });
    expect(final.status).toBe('over-budget');
    expect(final.violations).toHaveLength(1);
    expect(final.violations[0].name).toBe('INP');
  });

  it('END with zero metrics resolves unknown (never invents a pass)', () => {
    const state = transitionPerformanceBudget(IDLE, { type: 'START' });
    const final = transitionPerformanceBudget(state, { type: 'END', endedAt: 5000 });
    expect(final.status).toBe('unknown');
    expect(final.violations).toEqual([]);
  });

  it('ERROR during measuring moves to error and is terminal', () => {
    let state = transitionPerformanceBudget(IDLE, { type: 'START' });
    state = transitionPerformanceBudget(state, {
      type: 'ERROR',
      message: 'boom',
      measuredAt: 1000,
    });
    expect(state.status).toBe('error');
    expect(state.error).toBe('boom');
    expect(isPerformanceBudgetTerminal(state.status)).toBe(true);
  });

  it('RETRY reopens measurement from any terminal state', () => {
    const state = transitionPerformanceBudget(IDLE, { type: 'START' });
    let final = transitionPerformanceBudget(state, { type: 'END', endedAt: 5000 });
    expect(isPerformanceBudgetTerminal(final.status)).toBe(true);
    final = transitionPerformanceBudget(final, { type: 'RETRY' });
    expect(final.status).toBe('measuring');
    expect(final.metrics).toEqual({});
  });

  it('RESET returns to a clean idle state from anywhere', () => {
    let state = transitionPerformanceBudget(IDLE, { type: 'START' });
    state = transitionPerformanceBudget(state, {
      type: 'METRIC',
      name: 'LCP',
      value: 1200,
      measuredAt: 1000,
    });
    expect(transitionPerformanceBudget(state, { type: 'RESET' })).toEqual(IDLE);
  });

  it('illegal transitions throw with INVALID_TRANSITION', () => {
    expect(() =>
      transitionPerformanceBudget(IDLE, { type: 'METRIC', name: 'LCP', value: 1, measuredAt: 0 }),
    ).toThrow(PerformanceBudgetError);
    expect(() =>
      transitionPerformanceBudget(IDLE, { type: 'END', endedAt: 0 }),
    ).toThrow(PerformanceBudgetError);

    const state = transitionPerformanceBudget(IDLE, { type: 'START' });
    expect(() => transitionPerformanceBudget(state, { type: 'UNSUPPORTED', reason: 'x' })).toThrow(
      PerformanceBudgetError,
    );

    const terminal = transitionPerformanceBudget(
      transitionPerformanceBudget(IDLE, { type: 'START' }),
      { type: 'END', endedAt: 1 },
    );
    expect(() => transitionPerformanceBudget(terminal, { type: 'START' })).toThrow(
      PerformanceBudgetError,
    );
  });

  it('exhaustive status handling: no state transitions are silently ignored', () => {
    const statuses = [
      'idle',
      'measuring',
      'within-budget',
      'over-budget',
      'unknown',
      'error',
      'unsupported',
    ] as const;
    for (const status of statuses) {
      const bare = { ...IDLE, status };
      expect(() => transitionPerformanceBudget(bare, { type: 'RESET' })).not.toThrow();
    }
  });
});

describe('isBudgetMeasurementStale', () => {
  const terminal = {
    ...IDLE,
    status: 'within-budget' as const,
    metrics: { LCP: 1200 },
    measuredAt: 1000,
  };

  it('reports false while measuring or with no measurement', () => {
    expect(isBudgetMeasurementStale({ ...IDLE, status: 'measuring' }, 1_000_000, 500)).toBe(false);
    expect(isBudgetMeasurementStale(IDLE, 1_000_000, 500)).toBe(false);
  });

  it('reports stale after the staleness window elapses', () => {
    expect(isBudgetMeasurementStale(terminal, 1000 + 300, 500)).toBe(false);
    expect(isBudgetMeasurementStale(terminal, 1000 + 501, 500)).toBe(true);
  });
});