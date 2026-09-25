/**
 * StatusBadge primitive (V2-FE-121).
 *
 * Verifies the accessibility contract: meaning is carried by the text label
 * and a distinct icon (never colour alone), the optional description is
 * assistive-tech only, and `live` turns the badge into a polite status region.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { assertAccessible } from '@/__tests__/utils/axe';
import { StatusBadge } from '@/components/ui/primitives';
import { STATUS_TONES } from '@/lib/design-tokens';

function badge(container: HTMLElement): Element | null {
  return container.querySelector('[data-slot="status-badge"]');
}

describe('StatusBadge', () => {
  it('uses the visible label as the accessible name', () => {
    const { container } = render(<StatusBadge label="Finalized" tone="finalized" />);
    expect(screen.getByText('Finalized')).toBeInTheDocument();
    expect(badge(container)).toHaveAttribute('data-tone', 'finalized');
  });

  it('renders a decorative icon hidden from assistive tech', () => {
    const { container } = render(<StatusBadge label="Pending" tone="pending" />);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('focusable', 'false');
  });

  it('exposes the description to assistive tech only', () => {
    render(
      <StatusBadge
        label="Reorged"
        tone="orphaned"
        description="The receipt was orphaned."
      />,
    );
    const description = screen.getByText('. The receipt was orphaned.');
    expect(description).toHaveClass('sr-only');
  });

  it('becomes a polite live region when live', () => {
    const { container } = render(
      <StatusBadge label="Confirming" tone="confirmed" live />,
    );
    expect(badge(container)).toHaveAttribute('role', 'status');
    expect(badge(container)).toHaveAttribute('aria-live', 'polite');
  });

  it('is not a live region by default', () => {
    const { container } = render(<StatusBadge label="Ready" tone="neutral" />);
    expect(badge(container)).not.toHaveAttribute('role');
  });

  it.each(STATUS_TONES)(
    'renders the "%s" tone without axe violations',
    async (tone) => {
      const { container } = render(
        <StatusBadge label={`Tone ${tone}`} tone={tone} />,
      );
      await assertAccessible(container);
    },
  );
});
