'use client';

import { Download, FileSpreadsheet, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReportingCenterPage() {
  const reports = [
    { id: 1, name: "Q3 Revenue Forecast (Weighted)", category: "Forecasting", lastRun: "2 hours ago" },
    { id: 2, name: "Pipeline Coverage by Region", category: "Sales", lastRun: "1 day ago" },
    { id: 3, name: "Enterprise Customer Churn Risk", category: "Retention", lastRun: "Just now" },
    { id: 4, name: "Deal Loss & Competitor Analysis", category: "Sales Intelligence", lastRun: "4 days ago" },
    { id: 5, name: "Data Governance & Health Audit", category: "System", lastRun: "1 week ago" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-8 h-8 text-green-500" />
            Enterprise Reporting Center
          </h1>
          <p className="text-neutral-400 mt-1">Generate, schedule, and export advanced analytical reports.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-neutral-900 border-neutral-800"><Filter className="w-4 h-4 mr-2"/> Custom Filter</Button>
          <Button className="bg-primary text-white">Create Report</Button>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg">
        {reports.map((report, i) => (
          <div key={report.id} className={`p-4 flex justify-between items-center ${i !== reports.length - 1 ? 'border-b border-neutral-800' : ''}`}>
            <div>
              <h3 className="font-semibold text-neutral-200">{report.name}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">{report.category}</span>
                <span className="text-xs text-neutral-500">Last run: {report.lastRun}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs text-neutral-400 hover:text-white">View</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs border-neutral-700 bg-neutral-950">
                <Download className="w-3 h-3 mr-1" /> CSV
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
