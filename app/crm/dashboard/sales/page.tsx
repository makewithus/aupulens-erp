'use client';

import { Activity, AlertTriangle, TrendingUp, Users } from "lucide-react";
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

export default function SalesDashboard() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { cachedFetch("/api/crm/dashboard/summary", undefined, { force: true }).then((r) => r.json()).then((r) => r.success && setData(r.data.sales)).catch(() => {}); }, []);
  const n = (value: number | undefined) => value == null ? "—" : value.toLocaleString("en-IN");
  const money = (value: number | undefined) => value == null ? "—" : `₹${value.toLocaleString("en-IN")}`;
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Sales Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your personal pipeline and daily tasks.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI title="Today's Tasks" value={n(data?.tasksToday)} sub={`${n(data?.highPriorityTasks)} high priority open tasks`} icon={Activity} />
        <KPI title="Overdue Follow-ups" value={n(data?.overdueTasks)} sub="Action required" icon={AlertTriangle} />
        <KPI title="Pipeline Value" value={money(data?.pipelineValue)} sub={`${n(data?.openOpportunities)} open opportunities`} icon={TrendingUp} />
        <KPI title="New Leads" value={n(data?.weeklyLeads)} sub="Assigned to you this week" icon={Users} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <p className="text-muted-foreground text-sm">Deals at Risk</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <p className="text-muted-foreground text-sm">Forecast vs Quota</p>
        </div>
      </div>
    </div>
  );
}
