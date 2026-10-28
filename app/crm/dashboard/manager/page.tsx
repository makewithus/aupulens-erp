'use client';

import { BarChart, Users, Target, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";

function KPI({ title, value, sub, icon: Icon }: any) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="text-3xl font-bold font-sans tabular-nums tracking-tight">{value}</div>
      <p className="text-xs text-muted-foreground mt-2">{sub}</p>
    </div>
  );
}

export default function ManagerDashboard() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { cachedFetch("/api/crm/dashboard/summary", undefined, { force: true }).then((r) => r.json()).then((r) => r.success && setData(r.data.manager)).catch(() => {}); }, []);
  const n = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-IN");
  const money = (value: number | undefined) => value == null ? "—" : `₹${(value / 100000).toFixed(2)} L`;
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Sales Manager Dashboard</h1>
        <p className="text-muted-foreground mt-1">Team performance and pipeline health.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI title="Team Pipeline" value={money(data?.pipelineValue)} sub={`${n(data?.openOpportunities)} open opportunities`} icon={BarChart} />
        <KPI title="Win Rate" value={data?.winRate == null ? "—" : `${data.winRate}%`} sub="Closed won / lost opportunities" icon={Target} />
        <KPI title="Open Tasks" value={n(data?.openTasks)} sub="Across the workspace" icon={Users} />
        <KPI title="Weighted Pipeline" value={money(data?.weightedPipeline)} sub="Amount × deal probability" icon={Clock} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <p className="text-muted-foreground text-sm">Rep Performance Leaderboard</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <p className="text-muted-foreground text-sm">Source Performance Breakdown</p>
        </div>
      </div>
    </div>
  );
}
