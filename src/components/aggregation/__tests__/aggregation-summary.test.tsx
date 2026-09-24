import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AggregationSummary,
  type AggregationViewState,
} from '../aggregation-summary';
import {
  summarizeAggregation,
  type AggregationProjection,
} from '@/app/types/aggregation';

function projection(
  overrides: Partial<AggregationProjection> = {},
): AggregationProjection {
  return {
    claimId: 'claim-1',
    roundId: 0,
    supportingWeight: '700',
    opposingWeight: '300',
    quorumWeight: '500',
    finalized: false,
    asOfBlock: 12345,
    stale: false,
    ...overrides,
  };
}

describe('summarizeAggregation', () => {
  it('derives a supported verdict, confidence, and quorum from weights', () => {
    const view = summarizeAggregation(projection())!;
    expect(view.verdict).toBe('SUPPORTED');
    expect(view.confidence).toBeCloseTo(0.7, 5);
    expect(view.quorumReached).toBe(true);
    expect(view.isTie).toBe(false);
  });

  it('marks an equal split as a tie', () => {
    const view = summarizeAggregation(
      projection({ supportingWeight: '400', opposingWeight: '400' }),
    )!;
    expect(view.verdict).toBe('TIE');
    expect(view.isTie).toBe(true);
  });

  it('reports undecided and 0 confidence with no weight', () => {
    const view = summarizeAggregation(
      projection({ supportingWeight: '0', opposingWeight: '0', quorumWeight: null }),
    )!;
    expect(view.verdict).toBe('UNDECIDED');
    expect(view.confidence).toBe(0);
    expect(view.quorum).toBeNull();
  });

  it('fails closed (null) on malformed weights', () => {
    expect(summarizeAggregation(projection({ supportingWeight: 'oops' }))).toBeNull();
    expect(summarizeAggregation(projection({ opposingWeight: '-5' }))).toBeNull();
    expect(summarizeAggregation(projection({ quorumWeight: 'NaN' }))).toBeNull();
  });
});

describe('AggregationSummary', () => {
  it('renders an accessible loading state', () => {
    render(<AggregationSummary state={{ status: 'loading' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading aggregation/i);
    expect(screen.getByLabelText('Aggregation')).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('renders an empty state', () => {
    render(<AggregationSummary state={{ status: 'empty' }} />);
    expect(screen.getByText(/no aggregation data/i)).toBeInTheDocument();
  });

  it('renders an error alert with a working recovery action', async () => {
    const onRetry = jest.fn();
    render(
      <AggregationSummary
        state={{ status: 'error', message: 'boom' }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('presents a non-final projection as provisional, never final', () => {
    render(
      <AggregationSummary
        state={{ status: 'ready', projection: projection({ finalized: false }) }}
      />,
    );
    expect(screen.getByText(/provisional — not final/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Final$/)).not.toBeInTheDocument();

    const bar = screen.getByRole('progressbar', {
      name: /supporting weight share/i,
    });
    expect(bar).toHaveAttribute('aria-valuenow', '70');
    expect(screen.getByText(/leaning supported/i)).toBeInTheDocument();
    expect(screen.getByText(/confidence 70\.0%/i)).toBeInTheDocument();
    expect(screen.getByText(/reached/i)).toBeInTheDocument();
    expect(screen.getByText(/as of block 12345/i)).toBeInTheDocument();
  });

  it('shows the final badge only when the projection is finalized', () => {
    render(
      <AggregationSummary
        state={{ status: 'ready', projection: projection({ finalized: true }) }}
      />,
    );
    expect(screen.getByText(/^Final$/)).toBeInTheDocument();
    expect(screen.queryByText(/provisional/i)).not.toBeInTheDocument();
  });

  it('surfaces a tie and a stale projection', () => {
    render(
      <AggregationSummary
        state={{
          status: 'ready',
          projection: projection({
            supportingWeight: '400',
            opposingWeight: '400',
            stale: true,
          }),
        }}
      />,
    );
    expect(screen.getByText('Tie')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('fails closed to an error state on a malformed projection', () => {
    const onRetry = jest.fn();
    render(
      <AggregationSummary
        state={{
          status: 'ready',
          projection: projection({ supportingWeight: 'bad' }),
        }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/unavailable or malformed/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
