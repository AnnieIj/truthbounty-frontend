"use client"

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ActivityChartSkeleton } from "@/components/skeletons";

const activityData: Array<{ name: string; verified: number; disputed: number; false: number }> = [];

interface ActivityAndNodesProps {
  isLoading?: boolean;
}

const ActivityAndNodes = ({ isLoading = false }: ActivityAndNodesProps) => {
  if (isLoading) {
    return <ActivityChartSkeleton />;
  }

  return (
    <div className="bg-[#18181b] rounded-xl p-6 h-72 flex flex-col justify-between border border-[#232329] overflow-y-auto">
      <h2 className="text-white font-semibold mb-2">Verification Activity</h2>
      <div className="flex-1 w-full h-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={activityData}
            role="img"
            aria-label="Verification activity chart showing verified, disputed, and false claims over time"
            margin={{
              top: 10,
              right: 10,
              left: -20,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient id="colorVerified" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorDisputed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#facc15" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#facc15" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorFalse" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="name" 
              stroke="#71717a" 
              fontSize={12} 
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="#71717a" 
              fontSize={12} 
              tickLine={false}
              axisLine={false}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }}
              itemStyle={{ fontSize: '12px' }}
            />
            <Area
              type="monotone"
              dataKey="verified"
              stroke="#4ade80"
              fillOpacity={1}
              fill="url(#colorVerified)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="disputed"
              stroke="#facc15"
              fillOpacity={1}
              fill="url(#colorDisputed)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="false"
              stroke="#f87171"
              fillOpacity={1}
              fill="url(#colorFalse)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-4 text-xs text-[#a1a1aa]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
          <span>Verified</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
          <span>Disputed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400"></div>
          <span>False</span>
        </div>
      </div>
    </div>
  );
};

export default ActivityAndNodes;
