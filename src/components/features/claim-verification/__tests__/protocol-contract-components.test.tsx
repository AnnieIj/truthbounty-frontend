/**
 * V2-FE-141 — Protocol contract assertions for claim-verification components.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TransactionStatus } from '../TransactionStatus';
import { VerificationActions } from '../VerificationActions';
import { StakeForm } from '../StakeForm';

expect.extend(toHaveNoViolations);

jest.mock('@/app/lib/api', () => ({
  submitVerification: jest.fn(),
}));

jest.mock('@/lib/pending-transactions', () => ({
  trackPendingTransaction: jest.fn(),
  clearPendingTransaction: jest.fn(),
}));

jest.mock('@/app/lib/wallet', () => ({
  getTokenBalance: jest.fn(() => Promise.resolve(100)),
}));

jest.mock('@/hooks/useAccount', () => ({
  useAccount: () => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    displayName: '0xf39F…2266',
    chainId: 11155420,
  }),
}));

const { submitVerification } = jest.requireMock('@/app/lib/api') as {
  submitVerification: jest.Mock;
};

describe('TransactionStatus protocol contract states', () => {
  it.each([
    ['idle', null],
    ['pending', /transaction pending/i],
    ['success', /verification submitted/i],
    ['error', /transaction failed/i],
  ] as const)('renders %s without fabricating hashes', (status, text) => {
    const { container } = render(<TransactionStatus status={status} />);
    if (text) {
      expect(screen.getByText(text)).toBeInTheDocument();
    } else {
      expect(container).toHaveTextContent('');
    }
    expect(screen.queryByText(/0x[a-f0-9]{64}/i)).not.toBeInTheDocument();
  });
});

describe('VerificationActions fail-closed boundaries', () => {
  beforeEach(() => {
    submitVerification.mockReset();
  });

  it('does not call the API or show success when stake is missing', async () => {
    render(<VerificationActions claimId="claim-1" stakeAmount={0} />);
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => {
      expect(screen.getByText(/transaction failed/i)).toBeInTheDocument();
    });
    expect(submitVerification).not.toHaveBeenCalled();
    expect(screen.queryByText(/verification submitted/i)).not.toBeInTheDocument();
  });

  it('shows pending then success only after the API resolves', async () => {
    let resolve!: (value: unknown) => void;
    submitVerification.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<VerificationActions claimId="claim-1" stakeAmount={25} />);
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByText(/transaction pending/i)).toBeInTheDocument();
    expect(screen.queryByText(/verification submitted/i)).not.toBeInTheDocument();
    resolve({ id: 'v-1' });
    expect(await screen.findByText(/verification submitted/i)).toBeInTheDocument();
  });

  it('surfaces error without inventing confirmation when the API rejects', async () => {
    submitVerification.mockRejectedValue(new Error('revert'));
    render(<VerificationActions claimId="claim-1" stakeAmount={25} />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(await screen.findByText(/transaction failed/i)).toBeInTheDocument();
    expect(screen.queryByText(/verification submitted/i)).not.toBeInTheDocument();
  });

  it('is accessible in the idle state', async () => {
    const { container } = render(<VerificationActions claimId="claim-1" stakeAmount={10} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('StakeForm boundary conditions', () => {
  it('announces insufficient balance without inventing a successful stake', async () => {
    const { getTokenBalance } = jest.requireMock('@/app/lib/wallet') as {
      getTokenBalance: jest.Mock;
    };
    getTokenBalance.mockResolvedValueOnce(5);
    render(<StakeForm claimId="claim-1" />);
    await screen.findByText(/balance: 5 tbnt/i);
    fireEvent.change(screen.getByLabelText(/stake amount/i), {
      target: { value: '50' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/insufficient balance/i);
    expect(screen.queryByText(/staked successfully|confirmed/i)).not.toBeInTheDocument();
  });
});
