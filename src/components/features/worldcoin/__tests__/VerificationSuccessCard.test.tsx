import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VerificationSuccessCard } from '@/components/features/worldcoin/VerificationSuccessCard';

const VERIFIED_AT = '2026-01-01T12:00:00.000Z';
const EXPIRES_AT = '2027-01-01T12:00:00.000Z';

describe('VerificationSuccessCard', () => {
  it('displays verification and expiry with absolute UTC context', () => {
    render(
      <VerificationSuccessCard
        verificationLevel="orb"
        verifiedAt={VERIFIED_AT}
        expiresAt={EXPIRES_AT}
      />
    );

    expect(screen.getByText(/Verified:/)).toHaveTextContent('UTC');
    expect(screen.getByText(/Valid until:/)).toHaveTextContent('UTC');
  });

  it('contains a single, labelled, keyboard-focusable action button', () => {
    render(
      <VerificationSuccessCard
        verificationLevel="device"
        verifiedAt={VERIFIED_AT}
        expiresAt={EXPIRES_AT}
        onClose={() => undefined}
      />
    );

    const button = screen.getByRole('button', { name: /continue/i });
    expect(button).toHaveAccessibleName('Continue');
    expect(button).not.toBeDisabled();

    button.focus();
    expect(button).toHaveFocus();
  });

  it('activates the close action from the keyboard (Enter)', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    render(
      <VerificationSuccessCard
        verificationLevel="device"
        verifiedAt={VERIFIED_AT}
        expiresAt={EXPIRES_AT}
        onClose={onClose}
      />
    );

    const button = screen.getByRole('button', { name: /continue/i });
    button.focus();
    await user.keyboard('{Enter}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not create an action button when no handler is provided', () => {
    render(
      <VerificationSuccessCard
        verificationLevel="orb"
        verifiedAt={VERIFIED_AT}
        expiresAt={EXPIRES_AT}
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});