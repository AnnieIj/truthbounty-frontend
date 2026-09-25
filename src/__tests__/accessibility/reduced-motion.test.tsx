// src/__tests__/accessibility/reduced-motion.test.tsx
//
// Tests that verify sensory preference media-query features work correctly:
//  - prefers-reduced-motion: skeleton drops shimmer; activity feed / WS
//    indicator drop animate-pulse.
//  - Components remain axe-accessible regardless of the motion preference.

import React from 'react';
import { render } from '@testing-library/react';
import { assertAccessible } from '../utils/axe';
import { Skeleton } from '@/components/ui/skeleton';
import { WebSocketIndicator } from '@/components/ui/WebSocketStatus';
import { RealtimeActivityFeed } from '@/components/features/RealtimeActivityFeed';

// ─── Mock useReducedMotion so tests can control the return value ──────────────

let mockReducedMotion = false;

jest.mock('@/components/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

// ─── Other shared mocks ───────────────────────────────────────────────────────

jest.mock('@/components/providers/WebSocketProvider', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWebSocketContext: () => ({
    isConnected: true,
    connectionState: 'connected',
    subscribe: () => jest.fn(),
    send: jest.fn(),
  }),
  useWebSocketStatus: () => ({
    isConnected: true,
    connectionState: 'connecting',
    reconnectAttempts: 1,
  }),
}));

jest.mock('@/components/hooks/useTrust', () => ({
  useTrust: () => ({
    isVerified: true,
    reputation: 80,
    accountAgeDays: 30,
    suspicious: false,
  }),
}));

// ─── Skeleton ─────────────────────────────────────────────────────────────────

describe('Skeleton — reduced motion', () => {
  afterEach(() => {
    mockReducedMotion = false;
  });

  it('has the shimmer animation class when motion is not reduced', () => {
    mockReducedMotion = false;
    const { container } = render(<Skeleton className="h-4 w-32" />);
    expect(container.querySelector('.animate-shimmer')).toBeInTheDocument();
  });

  it('does NOT have the shimmer animation class when reduced motion is preferred', () => {
    mockReducedMotion = true;
    const { container } = render(<Skeleton className="h-4 w-32" />);
    expect(container.querySelector('.animate-shimmer')).not.toBeInTheDocument();
  });

  it('is axe-accessible when motion is not reduced', async () => {
    mockReducedMotion = false;
    const { container } = render(<Skeleton className="h-4 w-32" />);
    await assertAccessible(container);
  });

  it('is axe-accessible when motion is reduced', async () => {
    mockReducedMotion = true;
    const { container } = render(<Skeleton className="h-4 w-32" />);
    await assertAccessible(container);
  });
});

// ─── WebSocketIndicator ───────────────────────────────────────────────────────

describe('WebSocketIndicator — reduced motion', () => {
  afterEach(() => {
    mockReducedMotion = false;
  });

  it('has animate-pulse when motion is not reduced and state is connecting', () => {
    mockReducedMotion = false;
    const { container } = render(<WebSocketIndicator />);
    const dot = container.querySelector('span');
    expect(dot?.className).toContain('animate-pulse');
  });

  it('does NOT have animate-pulse when reduced motion is preferred', () => {
    mockReducedMotion = true;
    const { container } = render(<WebSocketIndicator />);
    const dot = container.querySelector('span');
    expect(dot?.className).not.toContain('animate-pulse');
  });

  it('is axe-accessible regardless of motion preference', async () => {
    mockReducedMotion = true;
    const { container } = render(<WebSocketIndicator />);
    await assertAccessible(container);
  });
});

// ─── RealtimeActivityFeed status dot ─────────────────────────────────────────

describe('RealtimeActivityFeed — reduced motion', () => {
  afterEach(() => {
    mockReducedMotion = false;
  });

  it('status dot has animate-pulse when connected and motion is not reduced', () => {
    mockReducedMotion = false;
    const { container } = render(<RealtimeActivityFeed />);
    const dot = container.querySelector('.bg-green-500');
    expect(dot?.className).toContain('animate-pulse');
  });

  it('status dot does NOT have animate-pulse when reduced motion is preferred', () => {
    mockReducedMotion = true;
    const { container } = render(<RealtimeActivityFeed />);
    const dot = container.querySelector('.bg-green-500');
    expect(dot?.className).not.toContain('animate-pulse');
  });

  it('is axe-accessible regardless of motion preference', async () => {
    mockReducedMotion = true;
    const { container } = render(<RealtimeActivityFeed />);
    await assertAccessible(container);
  });
});
