'use client';

import { AlertCircle, CheckCircle, Clock, HeartHandshake } from "lucide-react";

function KPI({ title, value, sub, icon: Icon }: any) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="text-3xl font-bold font-mono tracking-tight">{value}</div>
      <p className="text-xs text-muted-foreground mt-2">{sub}</p>
    </div>
  );
}

export default function SupportDashboard() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Support Dashboard</h1>
        <p className="text-muted-foreground mt-1">Case management and SLA compliance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI title="Open Cases" value="34" sub="12 High Priority" icon={AlertCircle} />
        <KPI title="Avg Resolution Time" value="4.2 Hrs" sub="-10% from last month" icon={Clock} />
        <KPI title="SLA Compliance" value="98%" sub="2 Breaches" icon={CheckCircle} />
        <KPI title="Customer Satisfaction" value="4.8/5" sub="Based on 120 reviews" icon={HeartHandshake} />
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
