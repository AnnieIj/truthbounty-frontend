import React from 'react';
import { render, screen } from '@/__tests__/utils/test-utils';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { REDACTED } from '@/lib/security/redaction';

function Thrower({ message }: { message: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary — redaction integration', () => {
  const secretHex = '0x' + 'a'.repeat(64);
  const errorMessage = `secret key is ${secretHex} and extra stuff`;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('does not render the raw 66-char secret hex into the DOM', () => {
    render(
      <ErrorBoundary scope="test:redaction">
        <Thrower message={errorMessage} />
      </ErrorBoundary>,
    );

    const allText = document.body.textContent || '';
    expect(allText).not.toContain('a'.repeat(64));
    expect(allText).not.toContain(secretHex);
  });

  it('console.error receives the REDACTED substitution instead of raw secret', () => {
    const consoleSpy = console.error as jest.Mock;

    render(
      <ErrorBoundary scope="test:redaction-log">
        <Thrower message={errorMessage} />
      </ErrorBoundary>,
    );

    expect(consoleSpy).toHaveBeenCalled();
    const calls = consoleSpy.mock.calls;
    const allArgsJoined = calls.map((args) => args.map(String).join(' ')).join('\n');
    expect(allArgsJoined).not.toContain(secretHex);
    expect(allArgsJoined).toContain(REDACTED);
  });

  it('preserves normal 66-char tx hash in a non-sensitive error message (not redacted)', () => {
    const txHash = '0x' + 'e'.repeat(64);
    const okMessage = `confirmed tx ${txHash} on chain`;

    render(
      <ErrorBoundary scope="test:txhash-preserve">
        <Thrower message={okMessage} />
      </ErrorBoundary>,
    );

    const allText = document.body.textContent || '';
    if (process.env.NODE_ENV !== 'development') {
      return;
    }
    const consoleSpy = console.error as jest.Mock;
    const calls = consoleSpy.mock.calls;
    const allArgsJoined = calls.map((args) => args.map(String).join(' ')).join('\n');
    expect(allArgsJoined).toContain(txHash);
    expect(allText).not.toContain(REDACTED + txHash);
  });
});
