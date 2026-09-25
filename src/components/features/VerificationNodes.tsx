import React from "react";
import { VerificationNodesSkeleton } from "@/components/skeletons";

const verificationNodes: Array<{ name: string; status: string; uptime: string; location: string }> = [];

interface VerificationNodesProps {
  isLoading?: boolean;
}

const VerificationNodes = ({ isLoading = false }: VerificationNodesProps) => {
  if (isLoading) {
    return <VerificationNodesSkeleton />;
  }

  return (
    <div className="bg-[#18181b] rounded-xl p-6 h-72 border border-[#232329] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className="text-white font-semibold">Verification Nodes</div>
        <button className="text-xs text-[#5b5bf6] cursor-pointer hover:underline" aria-label="View all verification nodes">View All</button>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div className="space-y-3">
          {verificationNodes.map((node, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#232329]/50 hover:bg-[#232329] transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-200">{node.name}</span>
                <span className="text-xs text-gray-400">{node.location}</span>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${node.status === 'Online' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  <span className={`text-xs ${node.status === 'Online' ? 'text-emerald-500' : 'text-amber-500'}`}>{node.status}</span>
                </div>
                <span className="text-xs text-gray-400 mt-0.5">{node.uptime}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="mt-4 pt-3 border-t border-[#232329] flex justify-between text-xs text-[#a1a1aa]">
        <span>Total Nodes: 124</span>
        <span>Active: 118</span>
      </div>
    </div>
  );
};

export default VerificationNodes;
