import React, { useRef, useState } from "react";
import { ActiveClaimsTableSkeleton } from "@/components/skeletons";
import { getCategoryIcon } from "@/lib/category-icons";
import { useDebounce } from "@/hooks/useDebounce";
import { useClaimsList } from "@/hooks/useClaimsList";
import { CLAIMS_LIST_DEFAULTS } from "@/app/types/claim-list";
import type { ClaimStatus } from "@/app/types/claim";
import {
  formatRelativeAge,
  formatStatus,
  getPaginationWindow,
} from "@/app/lib/format";

const activeClaims: Array<{
  category: string;
  impact: string;
  title: string;
  source: string;
  status: string;
  confidence: string;
  votes: string;
  stake: string;
  time: string;
  actions: string;
}> = [];

interface ActiveClaimsTableProps {
  /** Force the skeleton view while parent-level data is loading. */
  isLoading?: boolean;
}

interface FilterChip {
  label: string;
  status?: ClaimStatus;
  highImpact?: boolean;
}

/**
 * Canonical filter chips. Every chip maps to a documented projection filter —
 * no client-side widening or re-interpretation of API data.
 */
const FILTER_CHIPS: FilterChip[] = [
  { label: "All" },
  { label: "Open", status: "OPEN" },
  { label: "Under Review", status: "UNDER_REVIEW" },
  { label: "Verified", status: "VERIFIED" },
  { label: "Disputed", status: "DISPUTED" },
  { label: "High Impact", highImpact: true },
];

const STATUS_COLOR: Record<ClaimStatus, string> = {
  VERIFIED: "text-green-400",
  UNDER_REVIEW: "text-yellow-400",
  DISPUTED: "text-red-400",
  REJECTED: "text-red-400",
  OPEN: "text-[#5b5bf6]",
};

function formatUSD(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

const ActiveClaimsTable = ({ isLoading = false }: ActiveClaimsTableProps) => {
  const [searchInput, setSearchInput] = useState("");
  const [activeChip, setActiveChip] = useState(0);
  const [highImpactOnly, setHighImpactOnly] = useState(false);
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const debouncedSearch = useDebounce(
    searchInput,
    CLAIMS_LIST_DEFAULTS.debounceMs
  );

  // Any change to the query shape invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeChip, highImpactOnly]);

  const chip = FILTER_CHIPS[activeChip] ?? FILTER_CHIPS[0];
  const claims = useClaimsList({
    search: debouncedSearch.trim(),
    status: chip.status,
    highImpact: highImpactOnly || chip.highImpact,
    page,
    pageSize: CLAIMS_LIST_DEFAULTS.pageSize,
  });

  const envelope = claims.data;
  const pagination = envelope?.pagination;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const pageWindow = useMemo(
    () => getPaginationWindow(page, totalPages),
    [page, totalPages]
  );

  const handleClearSearch = () => {
    setSearchInput("");
    // Restore focus so keyboard users stay on the search field after clearing.
    searchInputRef.current?.focus();
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setActiveChip(0);
    setHighImpactOnly(false);
    setPage(1);
  };

  const hasActiveFilters =
    searchInput.trim().length > 0 || activeChip !== 0 || highImpactOnly;

  if (isLoading || claims.viewState === "loading") {
    return <ActiveClaimsTableSkeleton />;
  }

  const rows = envelope?.items ?? [];
  const total = pagination?.total ?? 0;
  const currentPage = pagination?.page ?? page;
  const currentPageSize = pagination?.pageSize ?? CLAIMS_LIST_DEFAULTS.pageSize;
  const firstRow = total === 0 ? 0 : (currentPage - 1) * currentPageSize + 1;
  const lastRow = Math.min(total, firstRow + rows.length - 1);

  const announcement =
    claims.viewState === "error"
      ? "Claims list failed to load."
      : claims.viewState === "empty"
        ? hasActiveFilters
          ? "No claims match the current search or filter."
          : "No claims have been indexed yet."
        : `Showing ${firstRow} to ${lastRow} of ${total} claims.`;

  return (
    <div className="bg-[#18181b] rounded-xl p-6 border border-[#232329]">
      {/* Screen-reader announcement of the current list state. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter claims">
          {FILTER_CHIPS.map((filter, idx) => (
            <button
              key={filter.label}
              className={`px-3 py-1 rounded text-xs ${
                activeChip === idx
                  ? "bg-[#232329] text-white"
                  : "bg-transparent text-[#a1a1aa] hover:text-white"
              }`}
              onClick={() => setActiveChip(idx)}
              aria-pressed={activeChip === idx}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="claims-search">Search claims</label>
          <div className="relative">
            <input
              id="claims-search"
              ref={searchInputRef}
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="bg-[#232329] text-white px-2 py-1 pr-7 rounded text-xs"
              placeholder="Search claims..."
              aria-label="Search claims"
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Clear search"
                title="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded text-[#a1a1aa] hover:text-white hover:bg-[#3a3a42] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b5bf6]"
              >
                {/* simple X glyph; avoids adding an icon dependency */}
                <span aria-hidden="true" className="text-sm leading-none">×</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {claims.viewState === "ready-stale" && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-300"
        >
          <p className="font-semibold">Claim data may be out of date.</p>
          <p className="mt-1 text-yellow-200/80">
            {envelope?.projection.reason
              ? `${envelope.projection.reason}. `
              : "The projection service has not confirmed this page is current. "}
            Updated {formatRelativeAge(envelope?.projection.generatedAt)}.
          </p>
        </div>
      )}

      {claims.isFetching && claims.viewState.startsWith("ready") && (
        <p className="mb-2 text-xs text-[#a1a1aa]" aria-live="polite">
          Updating…
        </p>
      )}

      {claims.viewState === "error" && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300"
        >
          <p className="font-semibold">Claims could not be loaded.</p>
          <p className="mt-1 text-red-200/80">
            {claims.error?.message ??
              "The claims projection is unavailable."}
            {claims.error?.code ? ` (${claims.error.code})` : ""}
          </p>
          <button
            type="button"
            onClick={claims.retry}
            className="mt-3 px-3 py-1 rounded bg-[#232329] text-xs text-white hover:bg-[#5b5bf6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b5bf6]"
          >
            Try again
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left" aria-label="Active claims">
          <thead>
            <tr className="text-[#a1a1aa] border-b border-[#232329]">
              <th scope="col" className="py-2">Claim</th>
              <th scope="col" className="py-2">Status</th>
              <th scope="col" className="py-2">Confidence</th>
              <th scope="col" className="py-2">Total Staked</th>
              <th scope="col" className="py-2">Updated</th>
              <th scope="col" className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.viewState === "empty" ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-[#a1a1aa]">
                  {hasActiveFilters ? (
                    <>
                      <p>No claims match the current search or filter.</p>
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="mt-3 px-3 py-1 rounded bg-[#232329] text-xs text-white hover:bg-[#5b5bf6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b5bf6]"
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    <p>No claims have been indexed yet. New claims will appear here automatically.</p>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((claim) => {
                const CategoryIcon = getCategoryIcon(claim.category ?? "");
                return (
                  <tr key={claim.id} className="border-b border-[#232329] hover:bg-[#232329]/40">
                    <td className="py-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-[#5b5bf6] font-semibold flex items-center gap-1.5">
                          <CategoryIcon size={14} />
                          {claim.category ?? "Uncategorized"}
                          {claim.highImpact && (
                            <span className="ml-2 bg-[#232329] text-[#5b5bf6] px-2 py-0.5 rounded-full text-[10px]">
                              High Impact
                            </span>
                          )}
                        </span>
                        <span className="text-white font-medium leading-tight">{claim.title}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={STATUS_COLOR[claim.status] ?? "text-[#a1a1aa]"}>
                        {formatStatus(claim.status)}
                      </span>
                    </td>
                    <td className="py-3">
                      {claim.confidenceScore === null ? (
                        <span className="text-[#a1a1aa]" title="Not yet scored">—</span>
                      ) : (
                        `${claim.confidenceScore}%`
                      )}
                    </td>
                    <td className="py-3">{formatUSD(claim.totalStaked)}</td>
                    <td className="py-3">{formatRelativeAge(claim.updatedAt)}</td>
                    <td className="py-3">
                      <Link
                        href={`/claims/${claim.id}`}
                        className="inline-block px-3 py-1 rounded bg-[#232329] text-xs text-white hover:bg-[#5b5bf6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b5bf6]"
                        aria-label={`View claim: ${claim.title}`}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {claims.viewState.startsWith("ready") && total > 0 && (
        <nav
          aria-label="Claims pagination"
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-xs text-[#a1a1aa]">
            Showing {firstRow}–{lastRow} of {total} claims
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
              className="px-3 py-1 rounded bg-[#232329] text-xs text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#5b5bf6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b5bf6]"
            >
              Previous
            </button>
            {pageWindow.map((entry, idx) =>
              entry === null ? (
                <span key={`ellipsis-${idx}`} aria-hidden="true" className="px-1 text-xs text-[#a1a1aa]">
                  …
                </span>
              ) : (
                <button
                  key={`page-${entry}`}
                  type="button"
                  onClick={() => setPage(entry)}
                  aria-current={entry === page ? "page" : undefined}
                  aria-label={`Go to page ${entry}`}
                  className={`px-2.5 py-1 rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b5bf6] ${
                    entry === page
                      ? "bg-[#5b5bf6] text-white"
                      : "bg-transparent text-[#a1a1aa] hover:text-white"
                  }`}
                >
                  {entry}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
              className="px-3 py-1 rounded bg-[#232329] text-xs text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#5b5bf6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b5bf6]"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
};

export default ActiveClaimsTable;
