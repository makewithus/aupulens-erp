'use client';

import { Sparkles, AlertTriangle, TrendingUp, UserX, Database, Crosshair } from "lucide-react";

function AIWidget({ title, value, sub, icon: Icon, alert = false }: any) {
  return (
    <div className={`bg-neutral-900 border ${alert ? 'border-red-900/50' : 'border-neutral-800'} rounded-lg p-5`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-semibold text-neutral-400">{title}</h3>
        {Icon && <Icon className={`w-4 h-4 ${alert ? 'text-red-500' : 'text-indigo-400'}`} />}
      </div>
      <div className="text-3xl font-bold font-mono tracking-tight">{value}</div>
      <p className="text-xs text-neutral-500 mt-2">{sub}</p>
    </div>
  );
}

export default function AIDashboard() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-indigo-400" />
          AI Control Center
        </h1>
        <p className="text-neutral-400 mt-1">High-level predictive analytics and system intelligence overview.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AIWidget title="At-Risk Deals" value="4" sub="$340K Pipeline Risk" icon={AlertTriangle} alert />
        <AIWidget title="High Churn Accounts" value="2" sub="Immediate attention needed" icon={UserX} alert />
        <AIWidget title="Forecast Confidence" value="84%" sub="+5% from last week" icon={TrendingUp} />
        <AIWidget title="Data Health" value="92%" sub="12 Missing Key Fields" icon={Database} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <Crosshair className="w-8 h-8 text-neutral-600 mb-2" />
          <p className="text-neutral-500 text-sm">Lead Quality Trends (Last 30 Days)</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <Sparkles className="w-8 h-8 text-neutral-600 mb-2" />
          <p className="text-neutral-500 text-sm">Top Next Best Action Recommendations</p>
        </div>
      </div>
    </div>
  );
}
