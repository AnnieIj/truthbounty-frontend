import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { useTranslations } from '@/i18n';

export interface StatusCardProps {
  status: 'pending' | 'confirming' | 'confirmed' | 'failed';
  count: number;
  icon?: LucideIcon;
}

const statusConfig = {
  pending: {
    icon: '⏱️',
    labelKey: 'transaction.states.pending' as const,
    bgColor: 'bg-slate-800',
    textColor: 'text-slate-400',
    countColor: 'text-slate-200',
  },
  confirming: {
    icon: '⚙️',
    labelKey: 'transaction.states.confirming' as const,
    bgColor: 'bg-orange-950',
    textColor: 'text-orange-400',
    countColor: 'text-orange-300',
  },
  confirmed: {
    icon: '✓',
    labelKey: 'transaction.states.confirmed' as const,
    bgColor: 'bg-green-950',
    textColor: 'text-green-400',
    countColor: 'text-green-300',
  },
  failed: {
    icon: '✕',
    labelKey: 'transaction.states.failed' as const,
    bgColor: 'bg-red-950',
    textColor: 'text-red-400',
    countColor: 'text-red-300',
  },
};

export function StatusCard({ status, count }: StatusCardProps) {
  const t = useTranslations();
  const config = statusConfig[status];

  return (
    <div
      className={`${config.bgColor} border border-slate-700 rounded-lg p-6 min-w-[200px]`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-lg ${config.textColor}`}>{config.icon}</span>
        <span className={`text-sm font-medium ${config.textColor}`}>
          {/* @ts-expect-error - Dynamic translation key */}
          {t(config.labelKey)}
        </span>
      </div>
      <div className={`text-3xl font-bold ${config.countColor}`}>{count}</div>
    </div>
  );
}
