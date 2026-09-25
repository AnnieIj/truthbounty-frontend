import React from 'react';
import { type LucideIcon } from 'lucide-react';

export interface StatusCardProps {
  status: 'pending' | 'confirming' | 'confirmed' | 'failed';
  count: number;
  icon?: LucideIcon;
}

const statusConfig = {
  pending: {
    icon: '⏱️',
    label: 'Pending',
    bgColor: 'bg-slate-800',
    textColor: 'text-slate-400',
    countColor: 'text-slate-200',
  },
  confirming: {
    icon: '⚙️',
    label: 'Confirming',
    bgColor: 'bg-orange-950',
    textColor: 'text-orange-400',
    countColor: 'text-orange-300',
  },
  confirmed: {
    icon: '✓',
    label: 'Confirmed',
    bgColor: 'bg-green-950',
    textColor: 'text-green-400',
    countColor: 'text-green-300',
  },
  failed: {
    icon: '✕',
    label: 'Failed',
    bgColor: 'bg-red-950',
    textColor: 'text-red-400',
    countColor: 'text-red-300',
  },
};

export function StatusCard({ status, count }: StatusCardProps) {
  const config = statusConfig[status];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`${config.bgColor} border border-slate-700 rounded-lg p-6 min-w-[200px]`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-lg ${config.textColor}`} aria-hidden="true">
          {config.icon}
        </span>
        <span className={`text-sm font-medium ${config.textColor}`}>
          {config.label}
        </span>
      </div>
      <div className={`text-3xl font-bold ${config.countColor}`}>{count}</div>
    </div>
  );
}
