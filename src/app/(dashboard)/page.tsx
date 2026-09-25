"use client";

import React from "react";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import StatsCards from "@/components/features/StatsCards";
import ActivityAndNodes from "@/components/features/ActivityAndNodes";
import VerificationNodes from "@/components/features/VerificationNodes";
import ActiveClaimsTable from "@/components/features/ActiveClaimsTable";
import ClaimRewardsPanel from "@/components/features/ClaimRewardsPanel";
import { useClaims } from "@/app/queries/claims.queries";
import { DashboardSkeleton } from "@/components/skeletons";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { NETWORK_COPY } from "@/lib/network-copy";

interface ReadNoticeProps {
  variant: "offline" | "error" | "stale";
  onRetry: () => void;
}

function ReadStatusNotice({ variant, onRetry }: ReadNoticeProps) {
  const copy: Record<ReadNoticeProps["variant"], { title: string; body: string }> = {
    offline: {
      title: NETWORK_COPY.dashboardOfflineTitle,
      body: "Showing previously loaded data. Reconnect to refresh protocol reads.",
    },
    error: {
      title: NETWORK_COPY.dashboardErrorTitle,
      body: NETWORK_COPY.dashboardErrorBody,
    },
    stale: {
      title: NETWORK_COPY.dashboardStaleTitle,
      body: NETWORK_COPY.dashboardStaleBody,
    },
  };

  const { title, body } = copy[variant];

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={`claims-read-notice-${variant}`}
      className="rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 underline text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Retry
      </button>
    </div>
  );
}

function OfflineEmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="claims-offline-empty"
      className="rounded-md border border-border bg-card px-6 py-10 text-center"
    >
      <p className="font-semibold">{NETWORK_COPY.dashboardOfflineTitle}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {NETWORK_COPY.dashboardOfflineEmpty}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 underline text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Try again
      </button>
    </div>
  );
}

const DashboardPage = () => {
  const {
    data,
    isPending,
    isError,
    isPaused,
    fetchStatus,
    isLoading: claimsLoading,
    refetch,
  } = useClaims();
  const { isOnline } = useNetworkStatus();

  const hasData = Boolean(data);
  const initialLoad = isPending && fetchStatus !== "paused";
  const offlineNoData = isPending && fetchStatus === "paused" && !hasData;
  const failedNoData = isError && !hasData && !offlineNoData;
  const showStaleNotice = hasData && (isError || !isOnline || isPaused);

  if (initialLoad) {
    return (
      <MainLayout>
        <DashboardSkeleton />
      </MainLayout>
    );
  }

  if (offlineNoData) {
    return (
      <MainLayout>
        <OfflineEmptyState onRetry={() => void refetch()} />
      </MainLayout>
    );
  }

  if (failedNoData) {
    return (
      <MainLayout>
        <ReadStatusNotice variant="error" onRetry={() => void refetch()} />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex flex-col gap-8">
        {showStaleNotice ? (
          <ReadStatusNotice
            variant={!isOnline || isPaused ? "offline" : "stale"}
            onRetry={() => void refetch()}
          />
        ) : null}
        <StatsCards isLoading={claimsLoading && !hasData} />
        <ClaimRewardsPanel isLoading={false} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-[#232329] bg-[#18181b] px-6 py-4">
          <div>
            <p className="text-sm font-medium text-white">Safe Treasury Withdrawal</p>
            <p className="text-xs text-[#a1a1aa]">
              Admin-only Optimism treasury controls with fail-closed simulation and typed confirm.
            </p>
          </div>
          <Link
            href="/treasury"
            className="text-sm font-semibold text-[#5b5bf6] underline underline-offset-2"
          >
            Open treasury UX
          </Link>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2">
            <ActivityAndNodes isLoading={claimsLoading && !hasData} />
          </div>
          <div className="xl:col-span-1">
            <VerificationNodes isLoading={claimsLoading && !hasData} />
          </div>
        </div>
        <ActiveClaimsTable isLoading={claimsLoading && !hasData} />
      </div>
    </MainLayout>
  );
};

export default DashboardPage;
