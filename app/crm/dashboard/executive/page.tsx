'use client';

import { Activity, TrendingUp, DollarSign, PieChart } from "lucide-react";

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

export default function ExecutiveDashboard() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Executive Dashboard</h1>
        <p className="text-muted-foreground mt-1">High-level revenue and business health metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI title="Total Revenue" value="₹4.5M" sub="+12% YoY Growth" icon={DollarSign} />
        <KPI title="Global Conversion" value="22%" sub="Lead to Contract" icon={TrendingUp} />
        <KPI title="Retention Rate" value="94%" sub="Net Revenue Retention" icon={Activity} />
        <KPI title="Global ROI" value="+150%" sub="Marketing Spend ROI" icon={PieChart} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-lg p-5 h-64 lg:col-span-2 flex flex-col justify-center items-center">
          <p className="text-muted-foreground text-sm">Revenue Trend & Forecast</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5 h-64 lg:col-span-1 flex flex-col justify-center items-center">
          <p className="text-muted-foreground text-sm">Growth by Segment</p>
        </div>
      </div>
    </div>
  );
}
