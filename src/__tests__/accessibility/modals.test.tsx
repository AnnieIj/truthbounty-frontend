import React from 'react'
import { render } from '../utils/test-utils'
import { assertAccessible } from '../utils/axe'

// Mock dependencies (do not mock 'wagmi' — test-utils WagmiProvider requires the real module)
jest.mock('@/hooks/useAccount', () => ({
  useAccount: () => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    displayName: '0xf39F…2266',
    chainId: 11155420,
    isConnected: true,
  }),
  useDisconnect: () => jest.fn(),
}))

jest.mock('@/hooks/useWriteReadiness', () => ({
  useWriteReadiness: () => ({
    isReady: true,
    message: null,
    primaryCode: null,
    codes: [],
    ready: true,
    failures: [],
    reason: null,
    account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    chainId: 11155420,
    expectedChainId: 11155420,
    targetAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  }),
}))

jest.mock('@/app/queries/claims.queries', () => ({
  useSubmitClaim: () => ({ mutateAsync: jest.fn(), isLoading: false }),
}))

jest.mock('@/components/hooks/useTrust', () => ({
  useTrust: () => ({
    reputation: 50,
    isVerified: true,
    accountAgeDays: 30,
    suspicious: false,
  }),
}))

jest.mock('@/components/providers/FeatureFlagProvider', () => ({
  useFeatureFlags: () => ({ isEnabled: () => true }),
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

describe('Accessibility: Modals and Dialogs', () => {
  it('ClaimSubmissionForm should have no axe violations', async () => {
    const ClaimSubmissionForm = (await import('@/components/features/claim-submission/ClaimSubmissionForm')).default
    const { container } = render(
      <ClaimSubmissionForm onSubmit={jest.fn()} onClose={jest.fn()} />
    )
    await assertAccessible(container)
  })

  it('TrustExplanationModal should have no axe violations', async () => {
    const TrustExplanationModal = (await import('@/components/ui/TrustExplanationModal')).default
    const { container } = render(
      <TrustExplanationModal onClose={jest.fn()} />
    )
    await assertAccessible(container)
  })
})
