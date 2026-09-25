/**
 * Accessibility / render tests for AppealRoundProgression (V2-FE-059).
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppealRoundProgression } from '../AppealRoundProgression';
import type { AppealRoundProgressionView } from '@/app/types/appeal';

const baseProgression: AppealRoundProgressionView = {
  appealId: 'appeal-123',
  roundNumber: 1,
  requiredBond: (10n ** 18n).toString(),
  deadlineSeconds: Math.floor(Date.now() / 1000) + 3600,
  timeRemainingSeconds: 3600,
  supportStake: (3n * 10n ** 18n).toString(),
  opposeStake: (1n * 10n ** 18n).toString(),
  state: 'ACTIVE',
  isActive: true,
  hasEnded: false,
  roundMatchesExpected: true,
  expectedRound: 1,
};

describe('AppealRoundProgression', () => {
  it('shows loading feedback', () => {
    render(<AppealRoundProgression progression={null} isLoading />);
    expect(screen.getByText(/Loading appeal round/i)).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<AppealRoundProgression progression={null} />);
    expect(screen.getByText(/No appeal round data/i)).toBeInTheDocument();
  });

  it('shows error with retry recovery', async () => {
    const onRefresh = jest.fn();
    const user = userEvent.setup();
    render(
      <AppealRoundProgression
        progression={null}
        error="RPC unavailable"
        onRefresh={onRefresh}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/RPC unavailable/);
    await user.click(screen.getByRole('button', { name: /Retry/i }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('renders round, bond, and deadline from progression', () => {
    render(<AppealRoundProgression progression={baseProgression} />);
    expect(
      screen.getByRole('heading', { name: /Appeal round progression/i })
    ).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/tokens/i)).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('warns when the round is stale', () => {
    render(
      <AppealRoundProgression
        progression={{
          ...baseProgression,
          roundNumber: 2,
          roundMatchesExpected: false,
          expectedRound: 1,
        }}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Round advanced/i);
  });
});
