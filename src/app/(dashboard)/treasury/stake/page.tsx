'use client';

import React from 'react';
import Link from 'next/link';

import MainLayout from '@/components/layout/MainLayout';
import StakeTreasuryWithdrawalPanel from '@/components/features/treasury/StakeTreasuryWithdrawalPanel';

export default function StakeTreasuryPage() {
  return (
    <MainLayout>
      <div className="flex flex-col gap-6 max-w-3xl">
        <div>
          <nav className="text-xs text-[#a1a1aa] mb-2" aria-label="Breadcrumb">
            <Link href="/treasury" className="hover:text-white underline">
              Protocol Treasury
            </Link>
            <span aria-hidden="true"> / </span>
            <span>Stake &amp; Withdrawal</span>
          </nav>
          <h1 className="text-2xl font-semibold text-white">Stake &amp; Treasury Withdrawal</h1>
          <p className="text-sm text-[#a1a1aa] mt-1">
            Reserved vs unlocked canonical balances, recipient/asset validation, and per-recipient
            withdrawal isolation. Outcomes come only from chain reads and real receipts.
          </p>
        </div>
        <StakeTreasuryWithdrawalPanel />
      </div>
    </MainLayout>
  );
}
