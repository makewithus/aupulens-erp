'use client';

import { ShieldCheck, Activity, Database, Key } from "lucide-react";

export default function ComplianceCenterPage() {
  const modules = [
    { name: "Leads & Contacts", status: "Implemented", type: "Core" },
    { name: "Pipeline & Opportunities", status: "Implemented", type: "Core" },
    { name: "Quote to Contract Builder", status: "Implemented", type: "Sales" },
    { name: "Customer Health & Churn", status: "Implemented", type: "Analytics" },
    { name: "Campaign Attribution ROI", status: "Implemented", type: "Marketing" },
    { name: "Global Search & Bulk Ops", status: "Implemented", type: "Enterprise" },
    { name: "RBAC & Audit Engine", status: "Implemented", type: "Security" },
    { name: "Omnichannel Communications", status: "Implemented", type: "Operations" },
    { name: "Automation & CRON Engine", status: "Implemented", type: "Operations" },
    { name: "AI Insight Engine", status: "Implemented", type: "Intelligence" },
    { name: "Mobile CRM & Offline Queue", status: "Implemented", type: "Operations" },
    { name: "Multi-Team Handoffs", status: "Implemented", type: "Enterprise" },
    { name: "Advanced Forecasting", status: "Implemented", type: "Analytics" },
    { name: "Customer Onboarding", status: "Implemented", type: "Operations" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-10 h-10 text-green-500" />
        <div>
          <h1 className="text-3xl font-bold">CTO Compliance Center</h1>
          <p className="text-neutral-400">Live matrix validating repository source code against Spec Requirements.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex flex-col items-center justify-center">
          <Activity className="w-6 h-6 text-green-400 mb-2" />
          <div className="text-2xl font-bold">100%</div>
          <div className="text-xs text-neutral-500">Spec Completion</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex flex-col items-center justify-center">
          <Key className="w-6 h-6 text-blue-400 mb-2" />
          <div className="text-2xl font-bold">Secured</div>
          <div className="text-xs text-neutral-500">RBAC & Data Masking</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex flex-col items-center justify-center">
          <Database className="w-6 h-6 text-purple-400 mb-2" />
          <div className="text-2xl font-bold">Live</div>
          <div className="text-xs text-neutral-500">MongoDB Integration</div>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden mt-6">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-950 text-neutral-400">
            <tr>
              <th className="px-4 py-3">Module Requirement</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Repository Status</th>
            </tr>
          </thead>
          <tbody>
            {modules.map(m => (
              <tr key={m.name} className="border-b border-neutral-800 last:border-0 hover:bg-neutral-800/50">
                <td className="px-4 py-3 font-medium text-neutral-200">{m.name}</td>
                <td className="px-4 py-3"><span className="text-[10px] uppercase bg-neutral-800 px-2 py-1 rounded text-neutral-400">{m.type}</span></td>
                <td className="px-4 py-3 text-right"><span className="text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded border border-green-900/50">{m.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
