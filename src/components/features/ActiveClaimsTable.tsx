import React, { useRef, useState } from "react";
import { ActiveClaimsTableSkeleton } from "@/components/skeletons";
import { getCategoryIcon } from "@/lib/category-icons";

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
  isLoading?: boolean;
}

const ActiveClaimsTable = ({ isLoading = false }: ActiveClaimsTableProps) => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const filters = ["All", "Verified", "Disputed", "Under Review", "High Impact"];

  const handleClearSearch = () => {
    setSearchQuery("");
    // Restore focus so keyboard users stay on the search field after clearing.
    searchInputRef.current?.focus();
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredClaims = activeClaims.filter((claim) => {
    const matchesFilter =
      activeFilter === "All"
        ? true
        : activeFilter === "High Impact"
        ? claim.impact === "High Impact"
        : claim.status === activeFilter;

    const searchableText = [claim.category, claim.title, claim.source]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);

    return matchesFilter && matchesSearch;
  });

  if (isLoading) {
    return <ActiveClaimsTableSkeleton />;
  }

  return (
    <div className="bg-[#18181b] rounded-xl p-6 border border-[#232329]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter claims">
          {filters.map((filter) => (
            <button
              key={filter}
              className={`px-3 py-1 rounded text-xs ${
                activeFilter === filter
                  ? "bg-[#232329] text-white"
                  : "bg-transparent text-[#a1a1aa] hover:text-white"
              }`}
              onClick={() => setActiveFilter(filter)}
              aria-pressed={activeFilter === filter}
            >
              {filter}
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#232329] text-white px-2 py-1 pr-7 rounded text-xs"
              placeholder="Search claims..."
              aria-label="Search claims"
            />
            {searchQuery.length > 0 && (
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
          <button
            className="px-3 py-1 rounded bg-[#232329] text-xs text-white"
            aria-label="Open additional filters"
          >
            Filter
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm text-left" aria-label="Active claims">
        <thead>
          <tr className="text-[#a1a1aa] border-b border-[#232329]">
            <th scope="col" className="py-2">Claim</th>
            <th scope="col" className="py-2">Status</th>
            <th scope="col" className="py-2">Confidence</th>
            <th scope="col" className="py-2">Votes / Stake</th>
            <th scope="col" className="py-2">Time Left</th>
            <th scope="col" className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredClaims.length > 0 ? (
            filteredClaims.map((claim, idx) => {
              const CategoryIcon = getCategoryIcon(claim.category);
              return (
              <tr key={idx} className="border-b border-[#232329] hover:bg-[#232329]/40">
                <td className="py-3">
                  <div className="flex flex-col">
                    <span className="text-xs text-[#5b5bf6] font-semibold flex items-center gap-1.5">
                      <CategoryIcon size={14} />
                      {claim.category}
                      <span className="ml-2 bg-[#232329] text-[#5b5bf6] px-2 py-0.5 rounded-full text-[10px]">{claim.impact}</span>
                    </span>
                    <span className="text-white font-medium leading-tight">{claim.title}</span>
                    <span className="text-xs text-[#a1a1aa]">{claim.source}</span>
                  </div>
                </td>
                <td className="py-3">
                  <span
                    className={
                      claim.status === "Verified"
                        ? "text-green-400"
                        : claim.status === "Under Review"
                        ? "text-yellow-400"
                        : "text-red-400"
                    }
                  >
                    {claim.status}
                  </span>
                </td>
                <td className="py-3">{claim.confidence}</td>
                <td className="py-3">
                  {claim.votes} <span className="text-[#a1a1aa]">/ {claim.stake}</span>
                </td>
                <td className="py-3">{claim.time}</td>
                <td className="py-3">
                  <button
                    className="px-3 py-1 rounded bg-[#232329] text-xs text-white hover:bg-[#5b5bf6]"
                    aria-label={`${claim.actions} claim: ${claim.title}`}
                  >
                    {claim.actions}
                  </button>
                </td>
              </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className="py-8 text-center text-sm text-[#a1a1aa]">
                No claims match the current search or filter. Try clearing your search or choosing a different filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
};

export default ActiveClaimsTable;
