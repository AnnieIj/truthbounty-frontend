import React from 'react';
import { render, screen } from '@testing-library/react';

import Sidebar from '../Sidebar';
import { trackPendingTransaction } from '@/lib/pending-transactions';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/components/features/claim-submission', () => ({
  ClaimSubmissionForm: () => <div data-testid="claim-form" />,
}));

jest.mock('@/components/providers', () => ({
  useFeatureFlags: () => ({
    isEnabled: () => true,
  }),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders a report bug link to the GitHub issue chooser', () => {
    render(<Sidebar />);
    const link = screen.getByRole('link', { name: /report bug/i });
    expect(link).toHaveAttribute('href', 'https://github.com/DigiNodes/truthbounty-frontend/issues/new/choose');
  });

  it('shows pending transactions in the sidebar status area', () => {
    trackPendingTransaction({
      id: 'verification:claim-1:verify',
      kind: 'verification',
      title: 'Verification stake pending',
      description: 'Claim claim-1 is waiting for wallet confirmation.',
      txHash: null,
      chainId: null,
      machineState: 'preparing',
    });

    render(<Sidebar />);
    expect(screen.getByTestId('sidebar-pending-transactions')).toHaveTextContent(/verification stake pending/i);
    expect(screen.getByText(/waiting for wallet confirmation/i)).toBeInTheDocument();
  });

  it('routes Submit Claim to the canonical claim creation page', () => {
    render(<Sidebar />);

    screen.getByRole('button', { name: /submit claim/i }).click();

    expect(push).toHaveBeenCalledWith('/claims/new');
  });
});
