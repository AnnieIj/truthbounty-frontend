"use client"

import React from "react";
import { useRouter } from "next/navigation";
import TrustIndicator from "@/components/ui/TrustIndicator";
import { WebSocketIndicator } from "@/components/ui/WebSocketStatus";
import { PerformanceBudgetIndicator } from "@/components/features/PerformanceBudgetIndicator";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { WalletConnection } from "../WalletConnection";
import { FeatureFlagGate } from "@/components/providers";

const Topbar = () => {
  const router = useRouter();

  return (
    <>
      <header className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8 border-b border-[#232329] bg-card" role="banner">
        <div className="flex items-center space-x-2 sm:space-x-4">
          <label className="sr-only" htmlFor="chain-select">Select chain</label>
          <select 
            id="chain-select"
            className="bg-accent text-foreground px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm"
            aria-label="Select chain"
          >
            <option>All Chains</option>
          </select>
          <FeatureFlagGate flag="ADVANCED_FILTERS">
            <>
              <label className="sr-only" htmlFor="time-filter">Filter by time</label>
              <select 
                id="time-filter"
                className="bg-accent text-foreground px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm"
                aria-label="Filter by time"
              >
                <option>All</option>
                <option>30d</option>
                <option>7d</option>
              </select>
            </>
          </FeatureFlagGate>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* WebSocket connection status */}
          <FeatureFlagGate flag="REALTIME_UPDATES">
            <WebSocketIndicator />
          </FeatureFlagGate>
          {/* Frontend performance budget status */}
          <FeatureFlagGate flag="PERFORMANCE_BUDGETS">
            <PerformanceBudgetIndicator />
          </FeatureFlagGate>
          {/* Theme toggle */}
          <ThemeToggle />
          {/* brief trust indicator */}
          <FeatureFlagGate flag="TRUST_SCORE_DISPLAY">
            <TrustIndicator />
          </FeatureFlagGate>
          {/* Wallet connection */}
          <FeatureFlagGate flag="WALLET_CONNECTION">
            <WalletConnection />
          </FeatureFlagGate>
          {/* Submit Claim button */}
          <FeatureFlagGate flag="CLAIM_SUBMISSION">
            <button
              className="bg-[#5b5bf6] text-white px-3 sm:px-4 py-2 rounded-md font-medium text-sm hover:bg-[#6c6cf7]"
              onClick={() => router.push("/claims/new")}
              aria-label="Submit a new claim"
            >
              <span className="hidden sm:inline">+ Submit Claim</span>
              <span className="sm:hidden">+ Claim</span>
            </button>
          </FeatureFlagGate>
        </div>
      </header>
    </>
  );
};

export default Topbar;
