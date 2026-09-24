'use client';

import { CheckCircle2, Shield, Calendar, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLocalDateTime, formatUtcDateTime } from '@/app/lib/format';

interface VerificationSuccessCardProps {
  verificationLevel: 'orb' | 'device';
  verifiedAt: string;
  expiresAt?: string;
  onClose?: () => void;
}

export function VerificationSuccessCard({
  verificationLevel,
  verifiedAt,
  expiresAt,
  onClose,
}: VerificationSuccessCardProps) {
  const formatVerified = (iso: string) => {
    const local = formatLocalDateTime(iso);
    if (local === '—') return '—';
    return `${local} (${formatUtcDateTime(iso)})`;
  };

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="size-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
            <CheckCircle2 className="size-6 text-green-600 dark:text-green-400" />
          </div>
        </div>
        
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
              Identity Verified Successfully!
            </h3>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              Your account is now protected against Sybil attacks and has full access to TruthBounty.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
              <Shield className="size-4" />
              <span>
                <span className="font-medium">Level:</span>{' '}
                {verificationLevel === 'orb' ? 'Orb (Highest)' : 'Device'}
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
              <Calendar className="size-4" />
              <span>
                <span className="font-medium">Verified:</span>{' '}
                {formatVerified(verifiedAt)}
              </span>
            </div>

            {expiresAt && (
              <div className="flex items-center gap-2 text-green-800 dark:text-green-200 sm:col-span-2">
                <Award className="size-4" />
                <span>
                  <span className="font-medium">Valid until:</span>{' '}
                  {formatVerified(expiresAt)}
                </span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-green-200 dark:border-green-800">
            <p className="text-xs text-green-700 dark:text-green-300">
              ✓ Higher trust score • ✓ Increased stake limits • ✓ Priority verification
            </p>
          </div>

          {onClose && (
            <div className="pt-2">
              <Button
                onClick={onClose}
                variant="outline"
                size="sm"
                className="border-green-300 dark:border-green-700"
              >
                Continue
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
