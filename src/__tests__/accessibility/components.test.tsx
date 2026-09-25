import React from 'react'
import { render, screen } from '../utils/test-utils'
import { assertAccessible } from '../utils/axe'

let mockTrust = {
  reputation: 50,
  isVerified: true,
  accountAgeDays: 30,
  suspicious: false,
}

let mockNetwork = {
  isOnline: false,
  saveData: false,
  effectiveType: null as string | null,
  isLowBandwidth: false,
}

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetwork,
  readLowBandwidth: () => mockNetwork.isLowBandwidth,
}))

jest.mock('@/components/hooks/useTrust', () => ({
  useTrust: () => mockTrust,
}))

jest.mock('@/components/providers/FeatureFlagProvider', () => ({
  useFeatureFlags: () => ({ isEnabled: () => true }),
  FeatureFlagGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FeatureFlagProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FeatureFlagPanel: () => null,
}))

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
  useWebSocketStatus: () => ({
    isConnected: true,
    connectionState: 'connected',
  }),
}))

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
}))

jest.mock('@/components/providers/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({
    theme: 'dark',
    setTheme: jest.fn(),
    resolvedTheme: 'dark',
  }),
}))

jest.mock('@/hooks/useAccount', () => ({
  useAccount: () => null,
  useDisconnect: () => jest.fn(),
}))

jest.mock('@/hooks/useIsMounted', () => ({
  useIsMounted: () => true,
}))

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  QueryClient: jest.fn().mockImplementation(() => ({
    defaultQueryOptions: jest.fn(),
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('Accessibility: UI Components', () => {
  beforeEach(() => {
    mockTrust = {
      reputation: 50,
      isVerified: true,
      accountAgeDays: 30,
      suspicious: false,
    }
  })

  it('TrustIndicator should have no axe violations', async () => {
    const TrustIndicator = (await import('@/components/ui/TrustIndicator')).default
    const { container } = render(<TrustIndicator />)
    await assertAccessible(container)
  })

  it('TrustWarningBanner should have no axe violations', async () => {
    mockTrust = {
      reputation: 10,
      isVerified: false,
      accountAgeDays: 1,
      suspicious: false,
    }
    const TrustWarningBanner = (await import('@/components/ui/TrustWarningBanner')).default
    const { container } = render(<TrustWarningBanner />)
    await assertAccessible(container)
  })

  it('ThemeToggle should have no axe violations', async () => {
    const { ThemeToggle } = await import('@/components/ui/ThemeToggle')
    const { container } = render(<ThemeToggle />)
    await assertAccessible(container)
  })

  it('WebSocketStatus should have no axe violations', async () => {
    const { WebSocketStatus } = await import('@/components/ui/WebSocketStatus')
    const { container } = render(<WebSocketStatus />)
    await assertAccessible(container)
  })

  it('OfflineBanner should have no axe violations when offline', async () => {
    mockNetwork = {
      isOnline: false,
      saveData: false,
      effectiveType: null,
      isLowBandwidth: false,
    }
    const OfflineBanner = (await import('@/components/ui/OfflineBanner')).default
    const { container } = render(<OfflineBanner />)
    expect(screen.getByTestId('offline-banner')).toHaveAttribute('aria-live', 'polite')
    await assertAccessible(container)
  })
})
