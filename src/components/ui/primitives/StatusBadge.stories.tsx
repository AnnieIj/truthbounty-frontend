import type { Meta, StoryObj } from '@storybook/react';

import { StatusBadge } from './StatusBadge';

const meta: Meta<typeof StatusBadge> = {
  title: 'UI/Primitives/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    tone: {
      control: { type: 'select' },
      options: [
        'neutral',
        'pending',
        'confirmed',
        'finalized',
        'orphaned',
        'success',
        'warning',
        'danger',
        'info',
      ],
    },
    live: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Default: Story = {
  args: {
    label: 'Awaiting settlement',
    tone: 'pending',
  },
};

export const Finalized: Story = {
  args: {
    label: 'Finalized',
    tone: 'finalized',
    description: 'Durable success; can no longer be reorganised.',
  },
};

export const Reorged: Story = {
  args: {
    label: 'Reorged',
    tone: 'orphaned',
  },
};

export const Live: Story = {
  args: {
    label: 'Confirming',
    tone: 'confirmed',
    live: true,
  },
};
