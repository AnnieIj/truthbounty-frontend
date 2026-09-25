import React from 'react';
import { render, screen } from '@testing-library/react';

import OfflineBanner from '../OfflineBanner';

const mockNetwork = {
  isOnline: true,
  saveData: false,
  effectiveType: null as string | null,
  isLowBandwidth: false,
};

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetwork,
}));

describe('OfflineBanner', () => {
  beforeEach(() => {
    mockNetwork.isOnline = true;
    mockNetwork.saveData = false;
    mockNetwork.effectiveType = null;
    mockNetwork.isLowBandwidth = false;
  });

  it('renders nothing when online at normal bandwidth', () => {
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces offline state in a polite live region', () => {
    mockNetwork.isOnline = false;
    render(<OfflineBanner />);
    const banner = screen.getByTestId('offline-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveTextContent(/you're offline/i);
  });

  it('shows a data-saver message when saveData is enabled', () => {
    mockNetwork.saveData = true;
    mockNetwork.isLowBandwidth = true;
    render(<OfflineBanner />);
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(/data saver is on/i);
  });

  it('shows a slow-connection message with effectiveType', () => {
    mockNetwork.effectiveType = '2g';
    mockNetwork.isLowBandwidth = true;
    render(<OfflineBanner />);
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(/slow connection detected/i);
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(/\(2g\)/);
  });
});
