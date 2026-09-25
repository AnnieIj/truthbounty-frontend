import React from 'react';
import { render, screen } from '@testing-library/react';

import Topbar from '../Topbar';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/components/providers', () => ({
  FeatureFlagGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/ui/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

jest.mock('@/components/ui/TrustIndicator', () => ({
  __esModule: true,
  default: () => <span>Trust</span>,
}));

jest.mock('@/components/ui/WebSocketStatus', () => ({
  WebSocketIndicator: () => <span>WebSocket</span>,
}));

jest.mock('@/components/features/PerformanceBudgetIndicator', () => ({
  PerformanceBudgetIndicator: () => <span>Performance</span>,
}));

jest.mock('@/components/WalletConnection', () => ({
  WalletConnection: () => <button type="button">Wallet</button>,
}));

describe('Topbar', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('routes Submit Claim to the canonical claim creation page', () => {
    render(<Topbar />);

    screen.getByRole('button', { name: /submit a new claim/i }).click();

    expect(push).toHaveBeenCalledWith('/claims/new');
  });
});