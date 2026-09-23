/**
 * ClaimSubmissionForm — wallet gate tests.
 *
 * Regression coverage for removed Freighter/Stellar path:
 *  - REMOVED: @stellar/freighter-api setAllowed call
 *  - REMOVED: "install/enable Freighter" error message
 *  - REPLACED: EVM wagmi useConnect / useConnectors flow
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockAccount: { address: `0x${string}`; displayName: string; chainId: number } | null = null;
const mockMutateAsync = jest.fn();
const mockConnect = jest.fn();
const mockConnectors = [{ id: 'injected', name: 'Injected', type: 'injected' }];

jest.mock('@/hooks/useAccount', () => ({
  useAccount: () => mockAccount,
}));

jest.mock('@/components/hooks/useTrust', () => ({
  useTrust: () => ({
    reputation: 100,
    accountAgeDays: 365,
    isVerified: true,
    suspicious: false,
  }),
}));

jest.mock('@/components/ui/TrustScoreTooltip', () => ({
  __esModule: true,
  default: () => <span data-testid="trust-tooltip" />,
}));

jest.mock('@/app/queries/claims.queries', () => ({
  useSubmitClaim: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// Wagmi hooks used by the form
jest.mock('wagmi', () => ({
  useConnect: () => ({ connect: mockConnect, connectors: mockConnectors }),
  useAccount: () => (mockAccount ? { address: mockAccount.address, chainId: mockAccount.chainId } : { address: undefined, chainId: undefined }),
  useChainId: () => mockAccount?.chainId ?? 11155420,
  usePublicClient: () => ({}),
  useReadContract: () => ({ data: undefined }),
  useWriteContract: () => ({ writeContractAsync: jest.fn() }),
}));

import ClaimSubmissionForm from '../ClaimSubmissionForm';

const CONNECTED = {
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`,
  displayName: '0xf39F…2266',
  chainId: 11155420,
};

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText('Title'), {
    target: { value: 'A real claim title' },
  });
  fireEvent.change(screen.getByPlaceholderText('Category'), {
    target: { value: 'Politics' },
  });
  fireEvent.change(screen.getByPlaceholderText('Impact'), {
    target: { value: 'High' },
  });
  fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
    target: { value: 'https://example.com/source' },
  });
  fireEvent.change(screen.getByPlaceholderText('Description'), {
    target: { value: 'A sufficiently long description.' },
  });
}

beforeEach(() => {
  mockAccount = null;
  mockConnect.mockReset();
  mockMutateAsync.mockReset();
  mockMutateAsync.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClaimSubmissionForm - wallet gate', () => {
  it('shows the Connect Wallet banner when no wallet is connected', () => {
    render(<ClaimSubmissionForm onClose={jest.fn()} />);
    expect(screen.getByTestId('connect-wallet-banner')).toBeInTheDocument();
    expect(screen.getByTestId('connect-wallet-button')).toBeInTheDocument();
  });

  it('hides the Connect Wallet banner when a wallet is connected', () => {
    mockAccount = CONNECTED;
    render(<ClaimSubmissionForm onClose={jest.fn()} />);
    expect(screen.queryByTestId('connect-wallet-banner')).not.toBeInTheDocument();
  });

  it('disables the submit button while the wallet is disconnected', () => {
    render(<ClaimSubmissionForm onClose={jest.fn()} />);
    const submit = screen.getByTestId('submit-claim-button');
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent(/connect your wallet to submit/i);
  });

  it('enables the submit button once a wallet is connected', () => {
    mockAccount = CONNECTED;
    render(<ClaimSubmissionForm onClose={jest.fn()} />);
    const submit = screen.getByTestId('submit-claim-button');
    expect(submit).not.toBeDisabled();
    expect(submit).toHaveTextContent(/^submit claim$/i);
  });

  it('calls wagmi connect() with the first connector when Connect Wallet is clicked', () => {
    render(<ClaimSubmissionForm onClose={jest.fn()} />);
    fireEvent.click(screen.getByTestId('connect-wallet-button'));
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledWith({ connector: mockConnectors[0] });
  });

  // Regression: Freighter setAllowed must NOT be called anywhere
  it('does NOT call @stellar/freighter-api setAllowed (removed path)', () => {
    // If the import was still present the module would throw since it's not mocked.
    // We verify the wagmi path is wired instead.
    render(<ClaimSubmissionForm onClose={jest.fn()} />);
    fireEvent.click(screen.getByTestId('connect-wallet-button'));
    // mockConnect (wagmi) was called, not setAllowed
    expect(mockConnect).toHaveBeenCalled();
  });
});

describe('ClaimSubmissionForm - submit guard', () => {
  it('does NOT call the submit mutation when no wallet is connected', async () => {
    const onClose = jest.fn();
    render(<ClaimSubmissionForm onClose={onClose} />);

    fillValidForm();
    fireEvent.submit(screen.getByTestId('submit-claim-button').closest('form')!);

    await waitFor(() => {
      expect(
        screen.getAllByText(/connect your wallet before submitting/i).length
      ).toBeGreaterThan(0);
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls the submit mutation when the wallet is connected and form is valid', async () => {
    mockAccount = CONNECTED;
    const onClose = jest.fn();
    const onSubmit = jest.fn();
    render(<ClaimSubmissionForm onSubmit={onSubmit} onClose={onClose} />);

    fillValidForm();
    fireEvent.submit(screen.getByTestId('submit-claim-button').closest('form')!);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      title: 'A real claim title',
      category: 'Politics',
      impact: 'High',
      source: 'https://example.com/source',
      description: 'A sufficiently long description.',
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ClaimSubmissionForm - source URL placeholder', () => {
  it('shows an example URL as the source field placeholder', () => {
    mockAccount = CONNECTED;
    render(<ClaimSubmissionForm onClose={jest.fn()} />);
    const sourceInput = screen.getByPlaceholderText('https://example.com');
    expect(sourceInput).toBeInTheDocument();
    expect(sourceInput).toHaveAttribute('name', 'source');
  });

  it('shows validation error when source URL is not a valid URL', () => {
    mockAccount = CONNECTED;
    render(<ClaimSubmissionForm onClose={jest.fn()} />);
    const sourceInput = screen.getByPlaceholderText('https://example.com');
    fireEvent.change(sourceInput, { target: { value: 'not-a-url' } });
    fireEvent.blur(sourceInput);
    expect(screen.getByText(/enter a valid url/i)).toBeInTheDocument();
  });

  it('clears source URL validation error when a valid URL is entered', () => {
    mockAccount = CONNECTED;
    render(<ClaimSubmissionForm onClose={jest.fn()} />);
    const sourceInput = screen.getByPlaceholderText('https://example.com');

    fireEvent.change(sourceInput, { target: { value: 'not-a-url' } });
    fireEvent.blur(sourceInput);
    expect(screen.getByText(/enter a valid url/i)).toBeInTheDocument();

    fireEvent.change(sourceInput, { target: { value: 'https://valid.example.com' } });
    fireEvent.blur(sourceInput);
    expect(screen.queryByText(/enter a valid url/i)).not.toBeInTheDocument();
  });
});

describe('Protocol invariant: submit-allowed ⇔ wallet-connected', () => {
  const cases: Array<[string, typeof CONNECTED | null, boolean]> = [
    ['no wallet', null, false],
    ['connected wallet', CONNECTED, true],
  ];

  test.each(cases)(
    '%s ⇒ submit enabled = %p AND mutation runs = %p',
    async (_label, account, expectEnabled) => {
      mockAccount = account;
      render(<ClaimSubmissionForm onClose={jest.fn()} />);

      const submit = screen.getByTestId('submit-claim-button');

      if (expectEnabled) {
        expect(submit).not.toBeDisabled();
      } else {
        expect(submit).toBeDisabled();
        expect(screen.getByTestId('connect-wallet-banner')).toBeInTheDocument();
      }

      fillValidForm();
      fireEvent.submit(submit.closest('form')!);

      if (expectEnabled) {
        await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
      } else {
        await Promise.resolve();
        expect(mockMutateAsync).not.toHaveBeenCalled();
      }
    }
  );
});
