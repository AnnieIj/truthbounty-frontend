import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/config/wagmi';
import { WebSocketProvider } from '@/components/providers/WebSocketProvider';
import DashboardPage from '@/app/(dashboard)/page';
import { NETWORK_COPY } from '@/lib/network-copy';

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/components/layout/Topbar', () => ({
  __esModule: true,
  default: () => <div data-testid="topbar" />,
}));

jest.mock('@/components/hooks/useTrust', () => ({
  useTrust: () => ({
    isVerified: true,
    reputation: 50,
    accountAgeDays: 30,
    suspicious: false,
  }),
}));

jest.mock('@/components/providers/FeatureFlagProvider', () => ({
  useFeatureFlags: () => ({ isEnabled: () => true }),
  FeatureFlagGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FeatureFlagProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FeatureFlagPanel: () => null,
}));

jest.mock('@/components/providers/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: 'dark', setTheme: jest.fn(), resolvedTheme: 'dark' }),
}));

jest.mock('@/components/providers/WebSocketProvider', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWebSocketContext: () => ({
    isConnected: true,
    connectionState: 'connected',
    lastMessage: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: () => jest.fn(),
    send: jest.fn(),
  }),
  useWebSocketStatus: () => ({ isConnected: true, connectionState: 'connected' }),
}));

jest.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: true,
    connectionState: 'connected',
    lastMessage: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: () => jest.fn(),
    send: jest.fn(),
  }),
}));

jest.mock('@/hooks/useAccount', () => ({
  useAccount: () => null,
  useDisconnect: () => jest.fn(),
}));

jest.mock('@/components/features/StatsCards', () => ({
  __esModule: true,
  default: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="stats-cards">{isLoading ? 'loading' : 'ready'}</div>
  ),
}));

jest.mock('@/components/features/ClaimRewardsPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="rewards" />,
}));

jest.mock('@/components/features/ActivityAndNodes', () => ({
  __esModule: true,
  default: () => <div data-testid="activity" />,
}));

jest.mock('@/components/features/VerificationNodes', () => ({
  __esModule: true,
  default: () => <div data-testid="nodes" />,
}));

jest.mock('@/components/features/ActiveClaimsTable', () => ({
  __esModule: true,
  default: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="claims-table">{isLoading ? 'loading' : 'ready'}</div>
  ),
}));

jest.mock('@/components/skeletons', () => ({
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton" />,
}));

const mockUseClaims = jest.fn();
jest.mock('@/app/queries/claims.queries', () => ({
  useClaims: () => mockUseClaims(),
}));

const mockNetwork = {
  isOnline: true,
  saveData: false,
  effectiveType: null as string | null,
  isLowBandwidth: false,
};

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetwork,
}));

function renderDashboard(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>
        <WebSocketProvider config={{ url: 'ws://test:8080' }}>
          <DashboardPage />
        </WebSocketProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

describe('Dashboard offline read resilience (V2-FE-129)', () => {
  beforeEach(() => {
    mockNetwork.isOnline = true;
    mockNetwork.isLowBandwidth = false;
    mockUseClaims.mockReset();
  });

  it('shows the loading skeleton on first load', () => {
    mockUseClaims.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isPaused: false,
      fetchStatus: 'fetching',
      isLoading: true,
      refetch: jest.fn(),
    });

    render(renderDashboard());
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
  });

  it('shows an offline empty state when paused with no cached data', () => {
    const refetch = jest.fn();
    mockUseClaims.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isPaused: true,
      fetchStatus: 'paused',
      isLoading: false,
      refetch,
    });
    mockNetwork.isOnline = false;

    render(renderDashboard());

    expect(screen.getByTestId('claims-offline-empty')).toBeInTheDocument();
    expect(screen.getByText(NETWORK_COPY.dashboardOfflineEmpty)).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument();
  });

  it('shows an error notice with retry when the read fails with no cache', () => {
    const refetch = jest.fn();
    mockUseClaims.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isPaused: false,
      fetchStatus: 'idle',
      isLoading: false,
      refetch,
    });

    render(renderDashboard());

    const notice = screen.getByTestId('claims-read-notice-error');
    expect(notice).toHaveTextContent(NETWORK_COPY.dashboardErrorTitle);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders cached data with a stale notice when a refresh fails', () => {
    mockUseClaims.mockReturnValue({
      data: [{ id: 'claim-1' }],
      isPending: false,
      isError: true,
      isPaused: false,
      fetchStatus: 'idle',
      isLoading: false,
      refetch: jest.fn(),
    });

    render(renderDashboard());

    expect(screen.getByTestId('claims-table')).toHaveTextContent('ready');
    expect(screen.getByTestId('claims-read-notice-stale')).toBeInTheDocument();
  });

  it('renders cached data with an offline notice while offline', () => {
    mockUseClaims.mockReturnValue({
      data: [{ id: 'claim-1' }],
      isPending: false,
      isError: false,
      isPaused: true,
      fetchStatus: 'paused',
      isLoading: false,
      refetch: jest.fn(),
    });
    mockNetwork.isOnline = false;

    render(renderDashboard());

    expect(screen.getByTestId('claims-table')).toHaveTextContent('ready');
    expect(screen.getByTestId('claims-read-notice-offline')).toBeInTheDocument();
  });

  it('renders the dashboard normally when data is fresh', () => {
    mockUseClaims.mockReturnValue({
      data: [{ id: 'claim-1' }],
      isPending: false,
      isError: false,
      isPaused: false,
      fetchStatus: 'idle',
      isLoading: false,
      refetch: jest.fn(),
    });

    render(renderDashboard());

    expect(screen.getByTestId('claims-table')).toHaveTextContent('ready');
    expect(screen.queryByTestId('claims-read-notice-stale')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claims-read-notice-offline')).not.toBeInTheDocument();
  });
});
