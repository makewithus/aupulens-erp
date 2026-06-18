'use client';

import { Activity, ServerCrash, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SystemHealthCenter() {
  const subsystems = [
    { name: "CRON Engine", status: "Healthy", lastChecked: "1m ago", failures: 0 },
    { name: "Automation Workflows", status: "Healthy", lastChecked: "5m ago", failures: 0 },
    { name: "ERP Integrations", status: "Degraded", lastChecked: "12m ago", failures: 3 },
    { name: "Email Delivery", status: "Healthy", lastChecked: "Just now", failures: 0 },
    { name: "AI Insight Engine", status: "Healthy", lastChecked: "1h ago", failures: 0 },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="w-8 h-8 text-green-500" /> System Health Center
          </h1>
          <p className="text-neutral-400 mt-1">Real-time status of backend operations and integrations.</p>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden mt-6">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-950 text-neutral-400">
            <tr>
              <th className="px-4 py-3">Subsystem</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Failures (24h)</th>
              <th className="px-4 py-3 text-right">Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {subsystems.map(sys => (
              <tr key={sys.name} className="border-b border-neutral-800 last:border-0 hover:bg-neutral-800/50">
                <td className="px-4 py-3 font-medium text-neutral-200">{sys.name}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={`text-xs ${
                    sys.status === 'Healthy' ? 'border-green-900/50 text-green-400' : 'border-yellow-900/50 text-yellow-400'
                  }`}>{sys.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  {sys.failures > 0 ? <span className="text-red-400 font-bold">{sys.failures}</span> : <span className="text-neutral-500">0</span>}
                </td>
                <td className="px-4 py-3 text-right text-xs text-neutral-500">{sys.lastChecked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
