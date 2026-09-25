"use client"

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from 'next/link';
import { useRouter } from "next/navigation";
import { FaGithub, FaDiscord, FaCog, FaBug } from "react-icons/fa";
import { HiOutlineDocumentText, HiOutlineQuestionMarkCircle } from "react-icons/hi";
import {
  MdRssFeed,
  MdDashboard,
  MdAddCircleOutline,
  MdGavel,
  MdVerifiedUser,
  MdAnalytics,
  MdPendingActions,
} from "react-icons/md";
import { useFeatureFlags } from "@/components/providers";
import {
  getPendingTransactions,
  subscribeToPendingTransactions,
  type PendingTransactionEntry,
} from '@/lib/pending-transactions';

const RESOURCE_LINKS = {
  docs: 'https://github.com/DigiNodes/truthbounty-frontend/blob/main/docs/ARCHITECTURE.md',
  github: 'https://github.com/DigiNodes/truthbounty-frontend',
  discord: 'https://discord.gg/storybook',
  bugReport: 'https://github.com/DigiNodes/truthbounty-frontend/issues/new/choose',
};

const Sidebar = () => {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransactionEntry[]>(() => getPendingTransactions());
  const { isEnabled } = useFeatureFlags();
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const firstNavItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return subscribeToPendingTransactions(setPendingTransactions);
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen) {
      firstNavItemRef.current?.focus();
    }
  }, [isMobileMenuOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsMobileMenuOpen(false);
      hamburgerRef.current?.focus();
    }
  }, []);

  const navItems = useMemo(() => {
    const items = [
      { label: "Claims Feed", icon: MdRssFeed, flag: null },
      { label: "My Dashboard", icon: MdDashboard, flag: null },
      { label: "Submit Claim", icon: MdAddCircleOutline, flag: 'CLAIM_SUBMISSION' as const },
      { label: "Active Disputes", icon: MdGavel, flag: 'CLAIM_DISPUTES' as const },
      { label: "Verifiers", icon: MdVerifiedUser, flag: 'CLAIM_VERIFICATION' as const },
      { label: "Analytics", icon: MdAnalytics, flag: 'ANALYTICS_DASHBOARD' as const },
    ];

    return items.filter(item => item.flag === null || isEnabled(item.flag));
  }, [isEnabled]);

  const handleNavClick = useCallback((label: string) => {
    if (label === "Submit Claim") router.push("/claims/new");
    setIsMobileMenuOpen(false);
  }, [router]);

  const handleNavKeyDown = useCallback((event: React.KeyboardEvent, label: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNavClick(label);
    }
  }, [handleNavClick]);

  return (
    <>
      <button
        ref={hamburgerRef}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#18181b] rounded-lg border border-[#232329] text-white"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label="Toggle navigation menu"
        aria-expanded={isMobileMenuOpen}
        aria-controls="sidebar-navigation"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          {isMobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => {
            setIsMobileMenuOpen(false);
            hamburgerRef.current?.focus();
          }}
          role="presentation"
        />
      )}

      <aside
        id="sidebar-navigation"
        className={`
        fixed lg:static inset-y-0 left-0 z-40
        flex flex-col w-64 h-full bg-card border-r border-border text-foreground
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
        aria-label="Sidebar navigation"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center h-16 px-6 py-6 font-bold text-lg tracking-tight border-b border-border">
          <span className="bg-[#5b5bf6] rounded-full w-8 h-8 flex items-center justify-center mr-2" aria-hidden="true">
            <span className="font-bold text-white">T</span>
          </span>
          TruthBounty
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <ul className="space-y-2">
            {navItems.map((item, index) => (
              <li key={item.label}>
                <button
                  ref={index === 0 ? firstNavItemRef : undefined}
                  className="w-full flex items-center px-3 py-3 rounded-lg hover:bg-accent text-sm font-medium text-left transition-colors"
                  onClick={() => handleNavClick(item.label)}
                  onKeyDown={(e) => handleNavKeyDown(e, item.label)}
                >
                  <item.icon className="w-5 h-5 text-[#a1a1aa]" aria-hidden="true" />
                  <span className="ml-3">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3" data-testid="sidebar-pending-transactions">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
              <MdPendingActions className="h-4 w-4" aria-hidden="true" />
              Pending transactions
            </div>
            {pendingTransactions.length === 0 ? (
              <p className="mt-2 text-xs text-amber-100/70">
                No transactions are waiting for confirmation right now.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pendingTransactions.slice(0, 3).map((transaction) => (
                  <li key={transaction.id} className="rounded-lg border border-amber-400/20 bg-black/10 px-3 py-2">
                    <p className="text-sm text-white">{transaction.title}</p>
                    <p className="mt-1 text-xs text-amber-100/80">{transaction.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="mt-8 space-y-2">
            <li>
              <Link href="/how-it-works" className="w-full flex items-center px-3 py-2 rounded-lg hover:bg-accent text-sm font-medium text-left transition-colors">
                <HiOutlineQuestionMarkCircle className="w-4 h-4 text-[#a1a1aa]" aria-hidden="true" />
                <span className="ml-3">How it works</span>
              </Link>
            </li>
            <li>
              <Link href={RESOURCE_LINKS.docs} target="_blank" rel="noopener noreferrer" className="w-full flex items-center px-3 py-2 rounded-lg hover:bg-[#232329] text-sm font-medium text-left transition-colors" aria-label="Documentation (opens in new tab)">
                <HiOutlineDocumentText className="w-4 h-4 text-[#a1a1aa]" aria-hidden="true" />
                <span className="ml-3">Documentation</span>
              </Link>
            </li>
            <li>
              <a href={RESOURCE_LINKS.github} target="_blank" rel="noopener noreferrer" className="w-full flex items-center px-3 py-2 rounded-lg hover:bg-[#232329] text-sm font-medium text-left transition-colors" aria-label="GitHub (opens in new tab)">
                <FaGithub className="w-4 h-4 text-[#a1a1aa]" aria-hidden="true" />
                <span className="ml-3">GitHub</span>
              </a>
            </li>
            <li>
              <a href={RESOURCE_LINKS.discord} target="_blank" rel="noopener noreferrer" className="w-full flex items-center px-3 py-2 rounded-lg hover:bg-[#232329] text-sm font-medium text-left transition-colors" aria-label="Discord (opens in new tab)">
                <FaDiscord className="w-4 h-4 text-[#a1a1aa]" aria-hidden="true" />
                <span className="ml-3">Discord</span>
              </a>
            </li>
            <li>
              <a href={RESOURCE_LINKS.bugReport} target="_blank" rel="noopener noreferrer" className="w-full flex items-center px-3 py-2 rounded-lg hover:bg-[#232329] text-sm font-medium text-left transition-colors" aria-label="Report Bug (opens in new tab)">
                <FaBug className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" />
                <span className="ml-3">Report Bug</span>
              </a>
            </li>
            <li>
              <button className="w-full flex items-center px-3 py-2 rounded-lg hover:bg-[#232329] text-sm font-medium text-left transition-colors">
                <FaCog className="w-4 h-4 text-[#a1a1aa]" aria-hidden="true" />
                <span className="ml-3">Settings</span>
              </button>
            </li>
          </ul>
        </nav>
        <div className="p-4">
          <button
            className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5b5bf6] to-[#232329] flex items-center justify-center text-white font-bold text-lg hover:opacity-90 transition-opacity"
            aria-label="User profile"
          >
            <span aria-hidden="true">🪪</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;