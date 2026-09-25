/**
 * Card + TokenAmount primitives (V2-FE-121).
 *
 * Card is a presentational surface bound to the semantic tokens; TokenAmount
 * renders a pre-formatted amount verbatim with tabular numerals and never
 * derives or rounds a value.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { assertAccessible } from '@/__tests__/utils/axe';
import { Card, TokenAmount } from '@/components/ui/primitives';

function bySlot(container: HTMLElement, slot: string): Element | null {
  return container.querySelector(`[data-slot="${slot}"]`);
}

describe('Card', () => {
  it('renders children on the base surface by default', () => {
    const { container } = render(<Card>Panel body</Card>);
    const card = bySlot(container, 'card');
    expect(card).toHaveTextContent('Panel body');
    expect(card).toHaveClass('bg-surface');
    expect(card).not.toHaveAttribute('data-elevated');
  });

  it('uses the elevated surface when requested', () => {
    const { container } = render(<Card elevated>Dialog</Card>);
    const card = bySlot(container, 'card');
    expect(card).toHaveClass('bg-elevated');
    expect(card).toHaveAttribute('data-elevated', 'true');
  });

  it('forwards landmark props (role/aria-labelledby)', () => {
    render(
      <Card role="region" aria-labelledby="hdr">
        <h2 id="hdr">Heading</h2>
      </Card>,
    );
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Card>Content</Card>);
    await assertAccessible(container);
  });
});

describe('TokenAmount', () => {
  it('renders the amount verbatim with tabular numerals', () => {
    const { container } = render(<TokenAmount amount="12.50" />);
    const amount = bySlot(container, 'token-amount');
    expect(amount).toHaveTextContent('12.50');
    expect(amount).toHaveClass('tabular-nums');
  });

  it('renders the symbol alongside the amount', () => {
    render(<TokenAmount amount="1.0" symbol="TBNT" />);
    expect(screen.getByText('TBNT')).toBeInTheDocument();
  });

  it('does not re-format or round the supplied value', () => {
    const { container } = render(<TokenAmount amount="0.100000000000000001" />);
    expect(bySlot(container, 'token-amount')).toHaveTextContent(
      '0.100000000000000001',
    );
  });

  it('has no axe violations', async () => {
    const { container } = render(<TokenAmount amount="5" symbol="TBNT" />);
    await assertAccessible(container);
  });
});
