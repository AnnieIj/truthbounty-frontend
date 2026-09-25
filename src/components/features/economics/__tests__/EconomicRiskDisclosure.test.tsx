/**
 * EconomicRiskDisclosure (V2-FE-116).
 *
 * Component contract: discloses canonical bond / fee / appeal window and the
 * real allowance state, and FAILS CLOSED (no amounts, an alert) when canonical
 * parameters cannot be verified.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { assertAccessible } from '@/__tests__/utils/axe';
import { EconomicRiskDisclosure } from '@/components/features/economics';
import * as economics from '@/lib/economics';

jest.mock('@/lib/economics', () => ({
  ...jest.requireActual('@/lib/economics'),
  getCanonicalEconomicParameters: jest.fn(),
}));

const mockedParams = economics.getCanonicalEconomicParameters as jest.Mock;

const CANONICAL = {
  chainId: 11155420,
  minBondWei: 1000000000000000000n,
  protocolFeeBps: 100,
  appealWindowSeconds: 604800,
};

function tokenAmount(container: HTMLElement, term: string): Element | null {
  const dt = screen.getByText(term);
  const row = dt.parentElement;
  return row?.querySelector('[data-slot="token-amount"]') ?? null;
}

describe('EconomicRiskDisclosure', () => {
  beforeEach(() => {
    mockedParams.mockReturnValue(CANONICAL);
  });

  it('renders a labelled region landmark', () => {
    render(<EconomicRiskDisclosure action="Verify" />);
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /bonds, allowances/i }),
    ).toBeInTheDocument();
  });

  it('discloses the canonical bond, protocol fee and appeal window', () => {
    const { container } = render(<EconomicRiskDisclosure action="Verify" />);
    expect(tokenAmount(container, 'Bond (TBNT)')).toHaveTextContent('1TBNT');
    expect(screen.getByText('1%')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
  });

  it('reports an unverified allowance as "Not verified yet" (fail closed)', () => {
    render(<EconomicRiskDisclosure action="Verify" />);
    expect(screen.getByText('Not verified yet')).toBeInTheDocument();
    expect(screen.queryByText('Approval required')).not.toBeInTheDocument();
    expect(screen.queryByText('Allowance set')).not.toBeInTheDocument();
  });

  it('flags an insufficient allowance as "Approval required"', () => {
    render(
      <EconomicRiskDisclosure
        action="Dispute"
        allowanceWei={0n}
        requiredAllowanceWei={1000000000000000000n}
      />,
    );
    expect(screen.getByText('Approval required')).toBeInTheDocument();
  });

  it('confirms a sufficient allowance', () => {
    render(
      <EconomicRiskDisclosure
        action="Dispute"
        allowanceWei={2000000000000000000n}
        requiredAllowanceWei={1000000000000000000n}
      />,
    );
    expect(screen.getByText('Allowance set')).toBeInTheDocument();
  });

  it('flags an unaffordable bond', () => {
    render(
      <EconomicRiskDisclosure action="Appeal" balanceWei={0n} />,
    );
    expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
  });

  it('fails closed when canonical parameters are unavailable', () => {
    mockedParams.mockReturnValue(null);
    const { container } = render(<EconomicRiskDisclosure action="Verify" />);
    expect(screen.getByText('Economics unavailable')).toBeInTheDocument();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    // No bond/fee/window amounts may be invented.
    expect(screen.queryByText('7 days')).not.toBeInTheDocument();
    expect(screen.queryByText('1%')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<EconomicRiskDisclosure action="Verify" />);
    await assertAccessible(container);
  });
});
