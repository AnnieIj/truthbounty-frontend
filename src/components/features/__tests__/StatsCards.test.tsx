import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatsCards from '../StatsCards';

// Mock useTrust hook
jest.mock('@/components/hooks/useTrust', () => ({
  useTrust: () => ({
    reputation: 95,
  }),
}));

// Mock StatsCardsSkeleton
jest.mock('@/components/skeletons', () => ({
  StatsCardsSkeleton: () => <div data-testid="stats-cards-skeleton" />,
}));

// Mock TrustScoreTooltip
jest.mock('@/components/ui/TrustScoreTooltip', () => {
  return function DummyTrustScoreTooltip() {
    return <div data-testid="trust-score-tooltip" />;
  };
});

describe('StatsCards Component', () => {
  it('renders loading skeleton when isLoading is true', () => {
    render(<StatsCards isLoading={true} />);
    expect(screen.getByTestId('stats-cards-skeleton')).toBeInTheDocument();
  });

  it('renders "My Trust" stat when isLoading is false', () => {
    render(<StatsCards isLoading={false} />);

    // Check "My Trust" value is rendered
    expect(screen.getByText('95')).toBeInTheDocument();
    expect(screen.getByText('My Trust')).toBeInTheDocument();

    // Check tooltip is rendered for "My Trust"
    expect(screen.getByTestId('trust-score-tooltip')).toBeInTheDocument();
  });

  it('matches snapshot to ensure no unexpected changes', () => {
    const { container } = render(<StatsCards isLoading={false} />);
    expect(container).toMatchSnapshot();
  });
});
