'use client';

import React from 'react';
import { Copy, ExternalLink, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openTransactionInExplorer } from '@/lib/explorer';

export interface TransactionItemProps {
  type: 'verification' | 'stake' | 'withdrawal' | 'dispute';
  status: 'confirming' | 'pending' | 'confirmed' | 'failed';
  title: string;
  description: string;
  amount: string;
  timeAgo: string;
  progress?: number;
  hash: string;
  errorMessage?: string;
  onRetry?: () => void;
  onCopy?: (hash: string) => void;
}

const typeConfig = {
  verification: {
    icon: '✓',
    color: 'text-blue-400',
  },
  stake: {
    icon: '📌',
    color: 'text-slate-400',
  },
  withdrawal: {
    icon: '💸',
    color: 'text-green-400',
  },
  dispute: {
    icon: '⚠️',
    color: 'text-red-400',
  },
};

const statusConfig = {
  confirming: {
    label: 'Confirming',
    color: 'bg-orange-500/20 text-orange-400',
    borderColor: 'border-orange-500/30',
  },
  pending: {
    label: 'Pending',
    color: 'bg-slate-500/20 text-slate-400',
    borderColor: 'border-slate-500/30',
  },
  confirmed: {
    label: 'Confirmed',
    color: 'bg-green-500/20 text-green-400',
    borderColor: 'border-green-500/30',
  },
  failed: {
    label: 'Failed',
    color: 'bg-red-500/20 text-red-400',
    borderColor: 'border-red-500/30',
  },
};

export function TransactionItem({
  type,
  status,
  title,
  description,
  amount,
  timeAgo,
  progress,
  hash,
  errorMessage,
  onRetry,
  onCopy,
}: TransactionItemProps) {
  const typeInfo = typeConfig[type];
  const statusInfo = statusConfig[status];

  return (
    <div className="border border-slate-700 rounded-lg p-6 bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1">
            <span className={`text-2xl ${typeInfo.color}`} aria-hidden="true">
              {typeInfo.icon}
            </span>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-white">{title}</h3>
              <span
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={`text-xs px-2 py-1 rounded ${statusInfo.color} ${statusInfo.borderColor} border`}
              >
                {statusInfo.label}
              </span>
            </div>
            <p className="text-sm text-slate-400">{description}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-white mb-1">{amount}</div>
          <div className="text-xs text-slate-400">{timeAgo}</div>
        </div>
      </div>

      {/* Progress bar */}
      {progress !== undefined && (
        <div className="mb-4">
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-xs text-slate-400 mt-2"
          >
            Confirmations: {progress}%
          </p>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded flex items-start gap-2"
        >
          <span className="text-red-400 mt-0.5" aria-hidden="true">
            ⚠️
          </span>
          <p className="text-sm text-red-400 break-words">{errorMessage}</p>
        </div>
      )}

      {/* Footer with hash and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <code className="text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded font-mono">
            {hash.slice(0, 10)}...{hash.slice(-5)}
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-slate-700"
            onClick={() => onCopy?.(hash)}
            title="Copy hash"
          >
            <Copy className="w-4 h-4 text-slate-400" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-slate-700"
            title="View on explorer"
            onClick={() => openTransactionInExplorer(hash)}
          >
            <ExternalLink className="w-4 h-4 text-slate-400" />
          </Button>
        </div>

        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 text-xs hover:bg-slate-700 border-slate-600 bg-transparent"
            onClick={onRetry}
          >
            <RotateCcw className="w-3 h-3" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
