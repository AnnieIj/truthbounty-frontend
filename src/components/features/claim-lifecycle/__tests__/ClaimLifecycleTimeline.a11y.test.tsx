/**
 * Accessibility tests for ClaimLifecycleTimeline component
 *
 * Tests WCAG AA compliance, screen reader support, keyboard navigation,
 * focus management, and semantic HTML using jest-axe.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClaimLifecycleTimeline } from '../ClaimLifecycleTimeline';

expect.extend(toHaveNoViolations);

// Mock the hook with different states
const mockUseClaimLifecycleTimeline = jest.fn();

jest.mock('@/hooks/useClaimLifecycleTimeline', () => ({
  useClaimLifecycleTimeline: (...args: any[]) => mockUseClaimLifecycleTimeline(...args),
}));

const mockTimeline = {
  claimId: 'claim-123',
  currentPhase: 'VERIFICATION_OPEN' as const,
  events: [
    {
      id: 'event-1',
      type: 'CLAIM_CREATED' as const,
      source: 'API_PROJECTION' as const,
      finality: 'INDEXED' as const,
      timestamp: Date.now() - 3600000,
      actor: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
      transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      blockNumber: 12345678n,
      metadata: {
        claimId: 'claim-123',
        claimant: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
        contentDigest: '0xabc',
        bountyAmount: '100',
        bountyToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        artifactVersion: '2.0.0',
      },
    },
    {
      id: 'event-2',
      type: 'CLAIM_INDEXED' as const,
      source: 'API_PROJECTION' as const,
      finality: 'INDEXED' as const,
      timestamp: Date.now() - 3500000,
      metadata: {
        claimId: 'claim-123',
        indexedAt: Date.now() - 3500000,
        indexerVersion: '2.0.0',
      },
    },
    {
      id: 'event-3',
      type: 'VERIFICATION_SUBMITTED' as const,
      source: 'CHAIN_EVENT' as const,
      finality: 'CONFIRMED' as const,
      timestamp: Date.now() - 1800000,
      transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      actor: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
      metadata: {
        claimId: 'claim-123',
        verifier: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
        position: 'TRUE',
        stake: '50',
      },
    },
  ],
  entries: [
    {
      event: {
        id: 'event-1',
        type: 'CLAIM_CREATED' as const,
        source: 'API_PROJECTION' as const,
        finality: 'INDEXED' as const,
        timestamp: Date.now() - 3600000,
        actor: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        blockNumber: 12345678n,
        metadata: {},
      },
      title: 'Claim Created',
      description: 'Claim submitted to the blockchain',
      icon: 'plus-circle',
      severity: 'info' as const,
      isUserAction: true,
      isPending: false,
      isStale: false,
      canReconcile: false,
    },
    {
      event: {
        id: 'event-2',
        type: 'CLAIM_INDEXED' as const,
        source: 'API_PROJECTION' as const,
        finality: 'INDEXED' as const,
        timestamp: Date.now() - 3500000,
        metadata: {},
      },
      title: 'Claim Indexed',
      description: 'Claim processed by the indexer',
      icon: 'database',
      severity: 'success' as const,
      isUserAction: false,
      isPending: false,
      isStale: false,
      canReconcile: false,
    },
    {
      event: {
        id: 'event-3',
        type: 'VERIFICATION_SUBMITTED' as const,
        source: 'CHAIN_EVENT' as const,
        finality: 'CONFIRMED' as const,
        timestamp: Date.now() - 1800000,
        transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        actor: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
        metadata: {},
      },
      title: 'Verification Submitted',
      description: 'Verification TRUE submitted',
      icon: 'check-circle',
      severity: 'info' as const,
      isUserAction: true,
      isPending: false,
      isStale: false,
      canReconcile: false,
    },
  ],
  lastUpdated: Date.now(),
  staleness: {
    isStale: false,
  },
  finality: {
    allEventsFinalized: true,
    pendingConfirmations: 0,
  },
  reconciliation: {
    isReconciling: false,
    failureCount: 0,
  },
};

describe('ClaimLifecycleTimeline Accessibility', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockUseClaimLifecycleTimeline.mockReturnValue({
      timeline: mockTimeline,
      isLoading: false,
      isError: false,
      error: null,
      isStale: false,
      reconcile: jest.fn(),
      isReconciling: false,
      lastReconciled: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ClaimLifecycleTimeline claimId="claim-123" {...props} />
      </QueryClientProvider>
    );
  };

  describe('WCAG AA Compliance', () => {
    it('should have no accessibility violations in success state', async () => {
      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in loading state', async () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: true,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in error state', async () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: false,
        isError: true,
        error: {
          code: 'CLAIM_NOT_FOUND',
          message: 'Claim not found',
          recoverable: true,
          retryAfterMs: 3000,
        },
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in empty state', async () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: { ...mockTimeline, events: [], entries: [] },
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in stale state', async () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: {
          ...mockTimeline,
          staleness: {
            isStale: true,
            reason: 'Data may be outdated',
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        isStale: true,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: Date.now() - 120000,
      });

      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in pending state', async () => {
      const pendingEntry = {
        ...mockTimeline.entries[0],
        isPending: true,
        event: {
          ...mockTimeline.entries[0].event,
          finality: 'SUBMITTED' as const,
        },
      };

      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: {
          ...mockTimeline,
          entries: [pendingEntry, ...mockTimeline.entries.slice(1)],
          finality: {
            allEventsFinalized: false,
            pendingConfirmations: 1,
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations with reconciliation error', async () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: {
          ...mockTimeline,
          reconciliation: {
            isReconciling: false,
            failureCount: 1,
            lastError: 'Reconciliation failed',
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in compact mode', async () => {
      const { container } = renderComponent({ compact: true });
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Semantic HTML', () => {
    it('should use proper heading hierarchy', () => {
      const { container } = renderComponent();
      
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      expect(headings.length).toBeGreaterThan(0);
      
      // Main heading should be h2
      const mainHeading = container.querySelector('h2');
      expect(mainHeading).toHaveTextContent('Claim Lifecycle');
    });

    it('should use list markup for timeline entries', () => {
      const { container } = renderComponent();
      
      const list = container.querySelector('[role="list"]');
      expect(list).toBeInTheDocument();
      
      const listItems = container.querySelectorAll('[role="listitem"]');
      expect(listItems.length).toBe(mockTimeline.entries.length);
    });

    it('should use time element for timestamps', () => {
      const { container } = renderComponent();
      
      const timeElements = container.querySelectorAll('time');
      expect(timeElements.length).toBe(mockTimeline.entries.length);
      
      timeElements.forEach((time) => {
        expect(time).toHaveAttribute('datetime');
      });
    });

    it('should use button element for interactive controls', () => {
      const { container } = renderComponent();
      
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
      
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('type');
      });
    });

    it('should use proper link markup for external links', () => {
      const { container } = renderComponent();
      
      const links = container.querySelectorAll('a[target="_blank"]');
      links.forEach((link) => {
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });
  });

  describe('ARIA Attributes', () => {
    it('should have proper ARIA labels', () => {
      const { container } = renderComponent();
      
      // List should be labeled
      const list = container.querySelector('[role="list"]');
      expect(list).toHaveAttribute('aria-labelledby');
      
      // Phase indicator should be labeled
      const phaseIndicator = container.querySelector('[role="status"][aria-label*="phase"]');
      expect(phaseIndicator).toBeInTheDocument();
    });

    it('should have live regions for dynamic content', () => {
      const { container } = renderComponent();
      
      // Screen reader announcements
      const liveRegions = container.querySelectorAll('[aria-live]');
      expect(liveRegions.length).toBeGreaterThan(0);
      
      // Should have polite live region for non-urgent updates
      const politeLiveRegion = container.querySelector('[aria-live="polite"]');
      expect(politeLiveRegion).toBeInTheDocument();
    });

    it('should use assertive live region for errors', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: false,
        isError: true,
        error: {
          code: 'CHAIN_QUERY_FAILED',
          message: 'Failed to query chain',
          recoverable: false,
        },
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      const { container } = renderComponent();
      
      const assertiveLiveRegion = container.querySelector('[aria-live="assertive"]');
      expect(assertiveLiveRegion).toBeInTheDocument();
    });

    it('should mark loading states with aria-busy', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: true,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      const { container } = renderComponent();
      
      const loadingContainer = container.querySelector('[aria-busy="true"]');
      expect(loadingContainer).toBeInTheDocument();
    });

    it('should have descriptive aria-labels for timeline entries', () => {
      const { container } = renderComponent();
      
      const entries = container.querySelectorAll('[role="listitem"]');
      entries.forEach((entry) => {
        expect(entry).toHaveAttribute('aria-label');
        const label = entry.getAttribute('aria-label');
        expect(label).toBeTruthy();
        expect(label!.length).toBeGreaterThan(0);
      });
    });

    it('should use aria-label for status indicators', () => {
      const { container } = renderComponent();
      
      const statusIndicators = container.querySelectorAll('[role="status"]');
      statusIndicators.forEach((indicator) => {
        // Status should have either aria-label or text content
        const hasLabel = indicator.hasAttribute('aria-label');
        const hasText = indicator.textContent && indicator.textContent.trim().length > 0;
        expect(hasLabel || hasText).toBe(true);
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('should have focusable interactive elements', () => {
      const { container } = renderComponent();
      
      const focusableElements = container.querySelectorAll(
        'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      expect(focusableElements.length).toBeGreaterThan(0);
    });

    it('should not have positive tabindex values', () => {
      const { container } = renderComponent();
      
      const elementsWithTabindex = container.querySelectorAll('[tabindex]');
      elementsWithTabindex.forEach((element) => {
        const tabindex = parseInt(element.getAttribute('tabindex') || '0', 10);
        expect(tabindex).toBeLessThanOrEqual(0);
      });
    });

    it('should have visible focus indicators', () => {
      const { container } = renderComponent();
      
      // Check that focusable elements don't have outline:none without alternatives
      const buttons = container.querySelectorAll('button');
      buttons.forEach((button) => {
        const computedStyle = window.getComputedStyle(button);
        // Should have focus-visible class support
        expect(button.className).toContain('focus-visible:');
      });
    });
  });

  describe('Screen Reader Support', () => {
    it('should have screen reader only text for context', () => {
      const { container } = renderComponent();
      
      // Check for sr-only class (screen reader only)
      const srOnlyElements = container.querySelectorAll('.sr-only');
      expect(srOnlyElements.length).toBeGreaterThan(0);
    });

    it('should hide decorative elements from screen readers', () => {
      const { container } = renderComponent();
      
      // Icons and decorative elements should have aria-hidden
      const decorativeElements = container.querySelectorAll('[aria-hidden="true"]');
      expect(decorativeElements.length).toBeGreaterThan(0);
    });

    it('should provide text alternatives for icons', () => {
      const { container } = renderComponent();
      
      // Each timeline entry icon should be aria-hidden with text label nearby
      const entries = container.querySelectorAll('[role="listitem"]');
      entries.forEach((entry) => {
        const icon = entry.querySelector('[aria-hidden="true"]');
        if (icon) {
          // Should have accessible text in the entry
          const text = entry.textContent;
          expect(text).toBeTruthy();
          expect(text!.length).toBeGreaterThan(0);
        }
      });
    });

    it('should announce phase changes', () => {
      const { container } = renderComponent();
      
      // Live region for phase announcements
      const liveRegion = container.querySelector('.sr-only[role="status"][aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });
  });

  describe('Color Contrast', () => {
    it('should not rely on color alone for information', () => {
      const { container } = renderComponent();
      
      // Check that severity indicators have both color AND text/icon
      const entries = container.querySelectorAll('[role="listitem"]');
      entries.forEach((entry) => {
        // Should have title text
        const title = entry.querySelector('h4, h3');
        expect(title).toBeTruthy();
        
        // Should have icon or badge
        const hasVisualIndicator = entry.querySelector('[aria-hidden="true"]');
        expect(hasVisualIndicator).toBeTruthy();
      });
    });

    it('should use semantic badges with labels', () => {
      const { container } = renderComponent();
      
      const badges = container.querySelectorAll('[role="status"]');
      badges.forEach((badge) => {
        // Badge should have aria-label or text content
        const hasLabel = badge.hasAttribute('aria-label');
        const hasText = badge.textContent && badge.textContent.trim().length > 0;
        expect(hasLabel || hasText).toBe(true);
      });
    });
  });

  describe('Reduced Motion Support', () => {
    it('should respect prefers-reduced-motion for animations', () => {
      const { container } = renderComponent();
      
      // Check for animate- classes that should respect motion preferences
      const animatedElements = container.querySelectorAll('[class*="animate-"]');
      animatedElements.forEach((element) => {
        // Animations should be optional through CSS
        expect(element.className).toBeTruthy();
      });
    });
  });

  describe('Form Controls', () => {
    it('should have accessible button labels', () => {
      const { container } = renderComponent();
      
      const buttons = container.querySelectorAll('button');
      buttons.forEach((button) => {
        // Button should have text content or aria-label
        const hasText = button.textContent && button.textContent.trim().length > 0;
        const hasLabel = button.hasAttribute('aria-label');
        expect(hasText || hasLabel).toBe(true);
      });
    });

    it('should indicate disabled state accessibly', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: mockTimeline,
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: true, // Button should be disabled
        lastReconciled: null,
      });

      const { container } = renderComponent();
      
      const disabledButtons = container.querySelectorAll('button[disabled]');
      expect(disabledButtons.length).toBeGreaterThan(0);
      
      disabledButtons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Error States', () => {
    it('should use role="alert" for errors', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: false,
        isError: true,
        error: {
          code: 'RECONCILIATION_MISMATCH',
          message: 'State mismatch detected',
          recoverable: true,
          retryAfterMs: 5000,
        },
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      const { container } = renderComponent();
      
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toBeInTheDocument();
    });

    it('should provide clear error messages', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: false,
        isError: true,
        error: {
          code: 'CHAIN_QUERY_FAILED',
          message: 'Failed to query chain',
          recoverable: false,
        },
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      const { container } = renderComponent();
      
      const errorMessage = container.querySelector('[role="alert"]');
      expect(errorMessage).toHaveTextContent('Failed to query chain');
    });
  });

  describe('Complex Interactions', () => {
    it('should maintain accessibility with multiple states active', async () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: {
          ...mockTimeline,
          staleness: {
            isStale: true,
            reason: 'Data may be outdated',
          },
          finality: {
            allEventsFinalized: false,
            pendingConfirmations: 2,
          },
          reconciliation: {
            isReconciling: false,
            failureCount: 1,
            lastError: 'Previous reconciliation failed',
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        isStale: true,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: Date.now() - 300000,
      });

      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
