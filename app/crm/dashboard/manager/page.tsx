'use client';

import { BarChart, Users, Target, Clock } from "lucide-react";

function KPI({ title, value, sub, icon: Icon }: any) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-semibold text-neutral-400">{title}</h3>
        {Icon && <Icon className="w-4 h-4 text-neutral-500" />}
      </div>
      <div className="text-3xl font-bold font-mono tracking-tight">{value}</div>
      <p className="text-xs text-neutral-500 mt-2">{sub}</p>
    </div>
  );
}

export default function ManagerDashboard() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Sales Manager Dashboard</h1>
        <p className="text-neutral-400 mt-1">Team performance and pipeline health.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI title="Team Pipeline" value="₹1.2M" sub="24 Open Opportunities" icon={BarChart} />
        <KPI title="Avg Conversion Rate" value="28%" sub="Lead to Won" icon={Target} />
        <KPI title="Total Activity Volume" value="450" sub="Calls/Emails this week" icon={Users} />
        <KPI title="Avg Lead Aging" value="14 Days" sub="Time in pipeline" icon={Clock} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <p className="text-neutral-500 text-sm">Rep Performance Leaderboard</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 h-64 flex flex-col justify-center items-center">
          <p className="text-neutral-500 text-sm">Source Performance Breakdown</p>
        </div>
      </div>
    </div>
  );
}
