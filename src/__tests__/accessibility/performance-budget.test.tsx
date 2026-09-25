import React from 'react';
import { render } from '../utils/test-utils';
import { assertAccessible } from '../utils/axe';
import { PerformanceBudgetIndicator } from '@/components/features/PerformanceBudgetIndicator';
import type { UsePerformanceBudgetReturn } from '@/hooks/usePerformanceBudget';

const baseReturn: UsePerformanceBudgetReturn = {
  status: 'idle',
  metrics: {},
  violations: [],
  measuredAt: null,
  isStale: false,
  isMonitoring: false,
  unsupportedReason: null,
  error: null,
  routeBudget: { route: '/', firstLoadJsKiB: 1850 },
  isSupported: true,
  retry: jest.fn(),
  reset: jest.fn(),
};

let mockReturn: UsePerformanceBudgetReturn = { ...baseReturn };

jest.mock('@/hooks/usePerformanceBudget', () => ({
  usePerformanceBudget: () => mockReturn,
}));

describe('Accessibility: PerformanceBudgetIndicator', () => {
  afterEach(() => {
    mockReturn = { ...baseReturn };
    jest.clearAllMocks();
  });

  const states: Array<[string, Partial<UsePerformanceBudgetReturn>]> = [
    ['within-budget', { status: 'within-budget', metrics: { LCP: 1200 } }],
    ['over-budget', { status: 'over-budget', metrics: { LCP: 9999 }, violations: [{ name: 'LCP', value: 9999, budget: 2500 }] }],
    ['measuring', { status: 'measuring', isMonitoring: true }],
    ['unknown', { status: 'unknown' }],
    ['error', { status: 'error', error: 'boom' }],
    ['unsupported', { status: 'unsupported', isSupported: false }],
  ];

  for (const [name, partial] of states) {
    it(`${name} indicator has no axe violations (collapsed)`, async () => {
      mockReturn = { ...baseReturn, ...partial };
      const { container } = render(<PerformanceBudgetIndicator />);
      await assertAccessible(container);
    });
  }

  it('over-budget indicator with details open has no axe violations', async () => {
    mockReturn = {
      ...baseReturn,
      status: 'over-budget',
      metrics: { LCP: 9999, INP: 300 },
      violations: [
        { name: 'LCP', value: 9999, budget: 2500 },
        { name: 'INP', value: 300, budget: 200 },
      ],
    };
    const { container } = render(<PerformanceBudgetIndicator />);
    container.querySelector('button')?.click();
    await assertAccessible(container);
  });
});