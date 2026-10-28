'use client';

import { AlertCircle, CheckCircle, Clock, HeartHandshake } from "lucide-react";
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

export default function SupportDashboard() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { cachedFetch("/api/crm/dashboard/summary", undefined, { force: true }).then((r) => r.json()).then((r) => r.success && setData(r.data.support)).catch(() => {}); }, []);
  const n = (value: number | undefined) => value == null ? "—" : value.toLocaleString("en-IN");
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Support Dashboard</h1>
        <p className="text-muted-foreground mt-1">Case management and SLA compliance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI title="Open Cases" value={n(data?.openCases)} sub={`${n(data?.highPriorityCases)} high priority`} icon={AlertCircle} />
        <KPI title="Average Resolution Time" value="—" sub="Resolution timestamps are not recorded" icon={Clock} />
        <KPI title="SLA Breaches" value={n(data?.slaBreaches)} sub="Open cases past SLA target" icon={CheckCircle} />
        <KPI title="Customer Satisfaction" value={data?.averageSatisfaction == null ? "—" : `${data.averageSatisfaction}/5`} sub={`Based on ${n(data?.satisfactionResponses)} responses`} icon={HeartHandshake} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <p className="text-muted-foreground text-sm">Escalation Trends</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <p className="text-muted-foreground text-sm">Ticket Volume by Category</p>
        </div>
      </div>
    </div>
  );
}
