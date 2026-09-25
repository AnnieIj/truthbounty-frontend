/**
 * SettlementStatusPanel (V2-FE-117).
 *
 * Component contract: an accessible, labelled region that renders honest
 * settlement/payout status, marks itself busy while loading, only links to an
 * explorer when a real hash exists, and never shows success on a reorg.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { assertAccessible } from '@/__tests__/utils/axe';
import { SettlementStatusPanel } from '@/components/features/settlement';

const HASH = `0x${'ab'.repeat(32)}` as `0x${string}`;

describe('SettlementStatusPanel', () => {
  it('renders a labelled region', () => {
    render(<SettlementStatusPanel state="PENDING_SETTLEMENT" />);
    const region = screen.getByRole('region');
    expect(region).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /settlement & payout/i }),
    ).toBeInTheDocument();
  });

  it('marks itself busy and shows a loading state', () => {
    render(<SettlementStatusPanel isLoading />);
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('shows an awaiting status without success', () => {
    render(<SettlementStatusPanel state="PENDING_SETTLEMENT" />);
    expect(screen.getByText('Awaiting settlement')).toBeInTheDocument();
    expect(screen.getByText(/voting has ended/i)).toBeInTheDocument();
  });

  it('renders payout and an explorer link at finality', () => {
    render(
      <SettlementStatusPanel
        state="SETTLED"
        finality="finalized"
        payoutWei={1500000000000000000n}
        symbol="TBNT"
        txHash={HASH}
        chainId={10}
      />,
    );
    expect(screen.getByText('Settled')).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /view settlement transaction/i });
    expect(link).toHaveAttribute(
      'href',
      `https://optimistic.etherscan.io/tx/${HASH}`,
    );
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not render an explorer link without a hash', () => {
    render(<SettlementStatusPanel state="SETTLED" finality="finalized" />);
    expect(
      screen.queryByRole('link', { name: /view settlement transaction/i }),
    ).not.toBeInTheDocument();
  });

  it('shows a reorg without success', () => {
    render(<SettlementStatusPanel state="SETTLED" finality="reorged" />);
    expect(screen.getByText('Reorged')).toBeInTheDocument();
    expect(screen.getByText(/reorganised/i)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <SettlementStatusPanel
        state="SETTLEMENT_CLAIMED"
        finality="finalized"
        payoutWei={1000000000000000000n}
        symbol="TBNT"
        txHash={HASH}
        chainId={10}
      />,
    );
    await assertAccessible(container);
  });
});
