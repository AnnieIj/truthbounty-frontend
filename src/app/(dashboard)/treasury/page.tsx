'use client';

import React from 'react';
import MainLayout from '@/components/layout/MainLayout';
import SafeTreasuryWithdrawalPanel from '@/components/features/treasury/SafeTreasuryWithdrawalPanel';

export default function TreasuryPage() {
  return (
    <MainLayout>
      <div className="flex flex-col gap-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold text-white">Protocol Treasury</h1>
          <p className="text-sm text-[#a1a1aa] mt-1">
            Safe withdrawal UX for the canonical Optimism treasury admin. Outcomes come only from
            chain reads and real receipts.
          </p>
        </div>
        <SafeTreasuryWithdrawalPanel />
      </div>
    </MainLayout>
  );
}
