import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { FeatureErrorBoundary } from '@/components/common/FeatureErrorBoundary';
import { RouteErrorFallback } from '@/components/common/RouteErrorFallback';
import { toSafeErrorMessage } from '@/lib/sanitize-error';
import { trackPendingTransaction } from '@/lib/pending-transactions';

function Boom({ message = 'boom' }: { message?: string }): never {
  throw new Error(message);
}

function AsyncHarness({ status }: { status: 'loading' | 'empty' | 'success' | 'rejection' }) {
  if (status === 'loading') return <p>Loading claim…</p>;
  if (status === 'empty') return <p>No claims found.</p>;
  if (status === 'success') return <p>Claim loaded.</p>;
  return <Boom message="fetch rejected" />;
}

describe('sanitize-error', () => {
  it('redacts addresses, hashes and stack frames in development', () => {
    const err = new Error(
      'fail 0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E hash 0x' +
        '1'.repeat(64) +
        '\n    at Component (file.tsx:10:5)'
    );
    const msg = toSafeErrorMessage(err);
    expect(msg).not.toContain('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E');
    expect(msg).not.toContain('1'.repeat(64));
    expect(msg).not.toMatch(/at\s+.+:\d+:\d+/);
  });

  it('returns generic fail-closed message outside development', () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    expect(toSafeErrorMessage(new Error('secret 0x' + '2'.repeat(64)))).toMatch(
      /Something went wrong/
    );
    (process.env as Record<string, string>).NODE_ENV = prev as string;
  });
});

describe('ErrorBoundary async states', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('renders loading state (success path, no error)', () => {
    render(
      <ErrorBoundary scope="test">
        <AsyncHarness status="loading" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Loading claim…')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(
      <ErrorBoundary scope="test">
        <AsyncHarness status="empty" />
      </ErrorBoundary>
    );
    expect(screen.getByText('No claims found.')).toBeInTheDocument();
  });

  it('renders success state', () => {
    render(
      <ErrorBoundary scope="test">
        <AsyncHarness status="success" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Claim loaded.')).toBeInTheDocument();
  });

  it('isolates rejection into accessible error with safe retry (error + recovery)', () => {
    render(
      <ErrorBoundary scope="claim-details">
        <AsyncHarness status="rejection" />
      </ErrorBoundary>
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getAllByText(/pending transactions are preserved/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/retry is safe/i)).toBeInTheDocument();
  });

  it('recovers via retry and via resetKeys', () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('flaky');
      return <p>recovered</p>;
    }
    const { rerender } = render(
      <ErrorBoundary scope="test" resetKeys={[1]}>
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('recovered')).toBeInTheDocument();

    // resetKeys path
    shouldThrow = true;
    rerender(
      <ErrorBoundary scope="test" resetKeys={[2]}>
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    shouldThrow = false;
    rerender(
      <ErrorBoundary scope="test" resetKeys={[3]}>
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('preserves pending-transaction recovery state across error + retry', () => {
    trackPendingTransaction({
      id: 'tx-1',
      kind: 'verification',
      title: 'Verify claim',
      description: 'pending verification',
      txHash: ('0x' + '3'.repeat(64)) as `0x${string}`,
      chainId: 10,
      machineState: 'submitted',
    });
    window.localStorage.setItem('tb-tx-v2:tx-1', JSON.stringify({ v: 2 }));

    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('fault');
      return <p>ok</p>;
    }
    render(
      <ErrorBoundary scope="verification-actions">
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(window.localStorage.getItem('truthbounty-pending-transactions-v2')).toContain('tx-1');
    expect(window.localStorage.getItem('tb-tx-v2:tx-1')).toContain('2');
  });

  it('never renders stack traces', () => {
    render(
      <ErrorBoundary scope="test">
        <Boom message={'nope\n    at Bad (x.tsx:1:1)'} />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/at Bad/)).not.toBeInTheDocument();
  });
});

describe('RouteErrorFallback', () => {
  it('wires reset() for safe retry and exposes keyboard-focusable actions', () => {
    const reset = jest.fn();
    render(
      <RouteErrorFallback error={new Error('fail')} reset={reset} scope="Dashboard" />
    );
    const retry = screen.getByRole('button', { name: /try again/i });
    retry.focus();
    expect(retry).toHaveFocus();
    fireEvent.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });
});

describe('FeatureErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('isolates feature faults without affecting siblings', () => {
    render(
      <div>
        <FeatureErrorBoundary scope="evidence">
          <Boom message="evidence failed" />
        </FeatureErrorBoundary>
        <p>sibling intact</p>
      </div>
    );
    expect(screen.getByText('sibling intact')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('production-bundle regression guard', () => {
  const sources = [
    'src/lib/sanitize-error.ts',
    'src/components/common/ErrorBoundary.tsx',
    'src/components/common/RouteErrorFallback.tsx',
    'src/components/common/FeatureErrorBoundary.tsx',
    'src/app/error.tsx',
    'src/app/global-error.tsx',
    'src/app/(dashboard)/error.tsx',
    'src/app/(dashboard)/claims/[id]/error.tsx',
  ];
  const forbidden = [/stellar/i, /soroban/i, /freighter/i, /mock-wallet/i, /simulator/i];

  it.each(sources)('no forbidden runtime deps in %s', (rel) => {
    const content = readFileSync(join(process.cwd(), rel), 'utf8');
    for (const pattern of forbidden) {
      expect(content).not.toMatch(pattern);
    }
  });

  it('does not fabricate protocol data helpers', () => {
    const lib = readFileSync(join(process.cwd(), 'src/lib/sanitize-error.ts'), 'utf8');
    // No on-chain write/receipt invocations or fabricated hash literals.
    expect(lib).not.toMatch(/writeContract\s*\(|sendTransaction\s*\(|getTransactionReceipt\s*\(/);
    expect(lib).not.toMatch(/0x[0-9a-fA-F]{10,}/);
  });
});
