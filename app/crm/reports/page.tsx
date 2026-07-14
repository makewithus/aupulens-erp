"use client";

import { useState } from "react";
import { BarChart, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PipelineTrendChart } from "@/components/crm/PipelineTrendChart";
import { RevenueTrendChart } from "@/components/crm/RevenueTrendChart";
import { CampaignROIChart } from "@/components/crm/CampaignROIChart";
import { ChurnRiskChart } from "@/components/crm/ChurnRiskChart";
import { UpcomingRenewalsChart } from "@/components/crm/UpcomingRenewalsChart";
import { SupportPerformanceChart } from "@/components/crm/SupportPerformanceChart";

export default function ReportsBuilderPage() {
  const [reportType, setReportType] = useState("pipeline");

  const reports = [
    { id: "pipeline", name: "Sales Pipeline" },
    { id: "revenue", name: "Revenue Trend" },
    { id: "campaign", name: "Campaign ROI" },
    { id: "churn", name: "Churn Risk" },
    { id: "renewals", name: "Upcoming Renewals" },
    { id: "support", name: "Support Performance" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-mono">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            Report Builder
          </h1>
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

      {/* Horizontal tabs selector */}
      <div className="flex flex-wrap items-center gap-6 border-b border-neutral-800 pb-4 mb-2">
        {reports.map((r, idx) => (
          <span key={r.id} className="flex items-center gap-6">
            <button
              onClick={() => setReportType(r.id)}
              className={`cursor-pointer pb-1.5 relative transition-colors text-xs font-mono ${
                reportType === r.id
                  ? "text-white after:content-[''] after:absolute after:left-0 after:bottom-[-6px] after:w-full after:h-[1px] after:bg-white font-medium"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {r.name}
            </button>
            {idx < reports.length - 1 && (
              <span className="text-neutral-800 select-none">|</span>
            )}
          </span>
        ))}
      </div>

      {/* Full-width visualization area */}
      <div className="w-full transition-all duration-300">
        {reportType === "pipeline" && <PipelineTrendChart />}
        {reportType === "revenue" && <RevenueTrendChart />}
        {reportType === "campaign" && <CampaignROIChart />}
        {reportType === "churn" && <ChurnRiskChart />}
        {reportType === "renewals" && <UpcomingRenewalsChart />}
        {reportType === "support" && <SupportPerformanceChart />}
      </div>
    </div>
  );
}
