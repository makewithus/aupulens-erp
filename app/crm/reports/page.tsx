'use client';

import { useState } from "react";
import { BarChart, LineChart, PieChart, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReportsBuilderPage() {
  const [reportType, setReportType] = useState("pipeline");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart className="w-6 h-6 text-primary" />
            Report Builder
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Build custom reports, configure widgets, and export CRM data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="text-xs h-8">
            <Download className="w-3 h-3 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" className="text-xs h-8">
            <Download className="w-3 h-3 mr-2" /> Export XLSX
          </Button>
          <Button className="bg-primary text-xs h-8">Save Report</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4 md:col-span-1 h-[600px] flex flex-col">
          <h3 className="font-semibold text-sm border-b border-neutral-800 pb-2">Report Templates</h3>
          <div className="space-y-1 flex-1 overflow-y-auto">
            {[
              { id: "pipeline", name: "Sales Pipeline", icon: BarChart },
              { id: "revenue", name: "Revenue Trend", icon: LineChart },
              { id: "campaign", name: "Campaign ROI", icon: PieChart },
              { id: "churn", name: "Churn Risk", icon: BarChart },
              { id: "renewals", name: "Upcoming Renewals", icon: LineChart },
              { id: "support", name: "Support Performance", icon: PieChart },
            ].map(r => (
              <button 
                key={r.id}
                onClick={() => setReportType(r.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                  reportType === r.id ? "bg-primary/20 text-primary font-medium" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                }`}
              >
                <r.icon className="w-4 h-4" /> {r.name}
              </button>
            ))}
          </div>
        </div>

        {/* Main Builder Area */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 md:col-span-3 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
            <BarChart className="w-8 h-8 text-neutral-500" />
          </div>
          <h2 className="text-lg font-bold text-neutral-300 mb-2">Report Viewer: {reportType}</h2>
          <p className="text-neutral-500 text-sm max-w-md">
            This module supports custom column selection, aggregation, and filtering based on the Advanced Filter Engine.
            Currently rendering the structure scaffolding. Real data visualization requires a charting library (e.g. Recharts).
          </p>
        </div>
      </div>
    </div>
  );
}
