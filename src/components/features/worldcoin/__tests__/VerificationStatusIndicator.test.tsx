import { render, screen } from '@testing-library/react';
import { VerificationStatusIndicator } from '@/components/features/worldcoin/VerificationStatusIndicator';

const DAY_MS = 24 * 60 * 60 * 1000;

function expiresIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

describe('VerificationStatusIndicator', () => {
  it('renders an accessible status region for a successful verification', () => {
    render(
      <VerificationStatusIndicator
        status="SUCCESS"
        verificationLevel="device"
        expiresAt={expiresIn(365 * DAY_MS)}
      />
    );

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAccessibleName(/device verified/i);
    expect(indicator).toHaveAccessibleName(/utc/i);
    expect(screen.getByText('Device Verified')).toBeInTheDocument();
  });

  it('signals an expiring-soon deadline while keeping a live expiry', () => {
    render(
      <VerificationStatusIndicator
        status="SUCCESS"
        verificationLevel="orb"
        expiresAt={expiresIn(10 * DAY_MS)}
      />
    );

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAccessibleName(/expires soon/i);
    expect(screen.getByText('(Expires soon)')).toBeInTheDocument();
  });

  it('does not report "expires soon" for a far-future expiry', () => {
    render(
      <VerificationStatusIndicator
        status="SUCCESS"
        verificationLevel="orb"
        expiresAt={expiresIn(365 * DAY_MS)}
      />
    );

    expect(screen.queryByText('(Expires soon)')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName(/orb verified/i);
  });

  it('never flags an expired deadline as "expiring soon"', () => {
    render(
      <VerificationStatusIndicator
        status="SUCCESS"
        verificationLevel="device"
        expiresAt={expiresIn(-1 * DAY_MS)}
      />
    );

    expect(screen.queryByText('(Expires soon)')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName(/expired/i);
  });

  it('canonically expired status wins even when the timestamp is missing', () => {
    render(
      <VerificationStatusIndicator
        status="EXPIRED"
        verificationLevel="orb"
        expiresAt={undefined}
      />
    );

    expect(screen.getByText('Verification Expired')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName(/verification expired/i);
  });

  it('fails closed on an invalid expiry date without crashing', () => {
    render(
      <VerificationStatusIndicator
        status="SUCCESS"
        verificationLevel="orb"
        expiresAt="not-a-real-date"
      />
    );

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAccessibleName('Orb Verified');
    expect(screen.queryByText('(Expires soon)')).not.toBeInTheDocument();
  });

  it('exposes an accessible name even when the visual label is hidden', () => {
    render(
      <VerificationStatusIndicator
        status="SUCCESS"
        verificationLevel="device"
        expiresAt={expiresIn(30 * DAY_MS)}
        showLabel={false}
      />
    );

    expect(screen.getByRole('status')).toHaveAccessibleName(/device verified/i);
  });
});