'use client';

import React, { ErrorInfo, ReactNode, createRef } from 'react';
import { toSafeErrorMessage } from '@/lib/sanitize-error';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Label identifying the route/feature scope, used for logging only. */
  scope?: string;
  /** Custom fallback. Receives sanitized message + retry. */
  fallback?: (args: { message: string; onRetry: () => void }) => ReactNode;
  onError?: (error: Error, info: ErrorInfo, scope?: string) => void;
  onReset?: () => void;
  /** When any entry changes, a caught error is cleared (safe retry/remount). */
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Shared route/feature error boundary.
 *
 * - Isolates rendering/data faults to its subtree.
 * - Never clears pending-transaction recovery keys
 *   (`truthbounty-pending-transactions-v2`, `tb-tx-v2:*`).
 * - Never renders stack traces or sensitive data in production.
 * - Provides keyboard-accessible retry with focus management.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryRef = createRef<HTMLButtonElement>();

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Fail closed: log only, never propagate sensitive detail to UI.
    console.error('ErrorBoundary caught:', this.props.scope ?? 'global', error, errorInfo);
    this.props.onError?.(error, errorInfo, this.props.scope);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState) {
    if (!this.state.hasError) return;
    if (!prevState.hasError) {
      this.retryRef.current?.focus();
      return;
    }
    const prev = prevProps.resetKeys ?? [];
    const next = this.props.resetKeys ?? [];
    if (prev.length !== next.length || prev.some((v, i) => !Object.is(v, next[i]))) {
      this.handleRetry();
    }
  }

  handleRetry = () => {
    // Safe retry: reset local error state only. Pending transaction stores
    // are intentionally left untouched so reload recovery still works.
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const message = toSafeErrorMessage(this.state.error);
      if (this.props.fallback) {
        return <>{this.props.fallback({ message, onRetry: this.handleRetry })}</>;
      }
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-[40vh] items-center justify-center px-4 py-10"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-lg dark:bg-gray-900">
            <h2 className="mb-3 text-xl font-semibold text-red-600">
              Something went wrong
            </h2>
            <p className="mb-2 text-gray-600 dark:text-gray-300">{message}</p>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              Your pending transactions are preserved. Retry is safe.
            </p>
            <button
              ref={this.retryRef}
              autoFocus
              type="button"
              onClick={this.handleRetry}
              className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
