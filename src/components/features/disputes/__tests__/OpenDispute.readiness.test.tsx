/**
 * OpenDispute — V2-FE-100 readiness gate tests.
 * Never invents dispute success without a real on-chain write.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockSubmitDispute = jest.fn();
const mockSimulateDispute = jest.fn();
const mockValidateDispute = jest.fn();

let mockReadiness: {
  isReady: boolean;
  message: string | null;
  primaryCode: string | null;
  codes: string[];
} = {
  isReady: true,
  message: null,
  primaryCode: null,
  codes: [],
};

const mockContext = {
  isEligible: true,
  bond: { bondAmount: '1000000000000000000' },
  walletPosition: {
    userAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    currentBalance: '5000000000000000000',
  },
};

jest.mock('@/hooks/useDisputeContext', () => ({
  useDisputeContext: () => ({
    context: mockContext,
    isLoading: false,
    error: null,
  }),
}));

jest.mock('@/hooks/useDisputeSubmission', () => ({
  useDisputeSubmission: () => ({
    validateDispute: mockValidateDispute,
    simulateDispute: mockSimulateDispute,
    submitDispute: mockSubmitDispute,
    isSimulating: false,
    isSubmitting: false,
    error: null,
  }),
  formatBondAmount: (wei: string) => {
    try {
      return (Number(BigInt(wei)) / 1e18).toFixed(4);
    } catch {
      return '0.0000';
    }
  },
}));

jest.mock('@/hooks/useWriteReadiness', () => ({
  useWriteReadiness: () => mockReadiness,
}));

jest.mock('@/lib/contracts/registry', () => ({
  getContractAddress: () => '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
}));

import { OpenDispute } from '../OpenDispute';

function fillReason() {
  fireEvent.change(screen.getByLabelText(/reason for dispute/i), {
    target: { value: 'This claim is incorrect because evidence is missing.' },
  });
}

describe('OpenDispute — write readiness gate (V2-FE-100)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadiness = {
      isReady: true,
      message: null,
      primaryCode: null,
      codes: [],
    };
    mockValidateDispute.mockReturnValue({ isValid: true, errors: [], warnings: [] });
    mockSimulateDispute.mockResolvedValue({
      success: true,
      projectedState: { disputeId: 'dispute-projected' },
    });
    mockSubmitDispute.mockRejectedValue(
      new Error(
        'Dispute submission requires wallet writeContract integration; no synthetic transaction hash is emitted.',
      ),
    );
  });

  it('disables Confirm and shows reason when readiness fails', () => {
    mockReadiness = {
      isReady: false,
      message: 'Wrong network: connected to chain 1, expected 11155420.',
      primaryCode: 'WRONG_CHAIN',
      codes: ['WRONG_CHAIN'],
    };

    render(
      <OpenDispute claimId="claim_1" isOpen={true} onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('write-readiness-reason')).toHaveTextContent(
      /wrong network/i,
    );
    const submit = screen.getByRole('button', { name: /wrong network|confirm dispute/i });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-describedby', 'write-readiness-reason');
  });

  it('enables Confirm when readiness passes and form is valid', () => {
    render(
      <OpenDispute claimId="claim_1" isOpen={true} onClose={jest.fn()} />,
    );

    const submit = screen.getByRole('button', { name: /confirm dispute/i });
    // Disabled until reason is provided; readiness itself is ready
    expect(submit).toBeDisabled();
    expect(screen.queryByTestId('write-readiness-reason')).not.toBeInTheDocument();

    fillReason();
    expect(screen.getByRole('button', { name: /confirm dispute/i })).not.toBeDisabled();
  });

  it('blocks submit when readiness fails at submit time and never calls submitDispute', async () => {
    mockReadiness = {
      isReady: false,
      message: 'Connect a wallet to continue.',
      primaryCode: 'WALLET_DISCONNECTED',
      codes: ['WALLET_DISCONNECTED'],
    };
    const onError = jest.fn();

    render(
      <OpenDispute claimId="claim_1" isOpen={true} onClose={jest.fn()} onError={onError} />,
    );

    fillReason();
    // Button is disabled — form submit via keyboard/programmatic path still gated
    const form = screen.getByRole('dialog').querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.stringMatching(/connect a wallet/i));
    });
    expect(mockSubmitDispute).not.toHaveBeenCalled();
  });

  it('never reports success with a projected dispute id (fails closed)', async () => {
    const onSuccess = jest.fn();
    const onClose = jest.fn();

    render(
      <OpenDispute
        claimId="claim_1"
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    fillReason();
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await waitFor(() => {
      expect(mockSubmitDispute).toHaveBeenCalled();
    });

    // submitDispute rejects without a real hash — no projected success
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /writeContract|synthetic/i,
      );
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
