"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as xlsx from "xlsx";
import { PipelineTrendChart } from "@/components/crm/PipelineTrendChart";
import { RevenueTrendChart } from "@/components/crm/RevenueTrendChart";
import { CampaignROIChart } from "@/components/crm/CampaignROIChart";
import { ChurnRiskChart } from "@/components/crm/ChurnRiskChart";
import { UpcomingRenewalsChart } from "@/components/crm/UpcomingRenewalsChart";
import { SupportPerformanceChart } from "@/components/crm/SupportPerformanceChart";
import { useThemeStore } from "@/store/themeStore";

// Report types with a real data source wired up. "campaign" (ROI) and
// "support" (case performance) have no aggregation endpoint built yet —
// left out of this set rather than faking one, per QA_GAP_REPORT.md #25.
const SUPPORTED_REPORTS = new Set(["pipeline", "revenue", "churn", "renewals"]);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function rowsToFile(rows: Record<string, any>[], filename: string, format: "csv" | "xlsx") {
  if (format === "csv") {
    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), `${filename}.csv`);
  } else {
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Report");
    const buffer = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
    downloadBlob(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `${filename}.xlsx`,
    );
  }
}

export default function ReportsBuilderPage() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";
  const [reportType, setReportType] = useState("pipeline");
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!SUPPORTED_REPORTS.has(reportType)) {
      toast.info("This report type isn't available to export yet.");
      return;
    }

    setIsExporting(true);
    try {
      if (reportType === "pipeline" || reportType === "revenue") {
        // Both backed by the existing, working opportunities export engine —
        // "revenue" maps to its forecast breakdown (pipeline/best-case/
        // likely/closed revenue), the closest real equivalent to a trend.
        const res = await fetch("/api/crm/opportunities/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format,
            scope: "all",
            reportType: reportType === "pipeline" ? "pipeline" : "forecast",
          }),
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        downloadBlob(blob, `${reportType === "pipeline" ? "Pipeline" : "Revenue"}_Report_${new Date().toISOString().split("T")[0]}.${format}`);
      } else if (reportType === "churn") {
        const res = await fetch("/api/crm/churn");
        const json = await res.json();
        const summary = json.data;
        const rows = [
          { Metric: "Low Risk Accounts", Value: summary.low },
          { Metric: "Medium Risk Accounts", Value: summary.medium },
          { Metric: "High Risk Accounts", Value: summary.high },
          { Metric: "Critical Risk Accounts", Value: summary.critical },
          ...summary.criticalAccounts.map((a: any) => ({
            Metric: `Critical: ${a.company_name}`,
            Value: a.score,
          })),
        ];
        rowsToFile(rows, `Churn_Risk_Report_${new Date().toISOString().split("T")[0]}`, format);
      } else if (reportType === "renewals") {
        const res = await fetch("/api/crm/renewals");
        const json = await res.json();
        const summary = json.data;
        const rows = [
          { Metric: "Expiring in 7 days", Value: summary.expiring7 },
          { Metric: "Expiring in 30 days", Value: summary.expiring30 },
          { Metric: "Expiring in 60 days", Value: summary.expiring60 },
          { Metric: "Expiring in 90 days", Value: summary.expiring90 },
          { Metric: "Expired but still active", Value: summary.expiredActive },
          { Metric: "Renewal Pipeline Value (90 days)", Value: summary.renewalPipelineValue90Days },
        ];
        rowsToFile(rows, `Renewals_Report_${new Date().toISOString().split("T")[0]}`, format);
      }
      toast.success(`Report exported as ${format.toUpperCase()}`);
    } catch {
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveReport = () => {
    toast.info("Saved reports aren't available yet — export the report instead.");
  };

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
          <Button variant="outline" className="text-xs h-8" disabled={isExporting} onClick={() => handleExport("csv")}>
            <Download className="w-3 h-3 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" className="text-xs h-8" disabled={isExporting} onClick={() => handleExport("xlsx")}>
            <Download className="w-3 h-3 mr-2" /> Export XLSX
          </Button>
          <Button className="bg-primary text-xs h-8" onClick={handleSaveReport}>Save Report</Button>
        </div>
      </div>

      {/* Horizontal tabs selector */}
      <div className={`flex flex-wrap items-center gap-6 border-b pb-4 mb-2 ${
        isDark ? "border-neutral-800" : "border-neutral-200"
      }`}>
        {reports.map((r) => (
          <span key={r.id} className="flex items-center gap-2">
            <button
              onClick={() => setReportType(r.id)}
              className={`cursor-pointer pb-1.5 relative transition-colors text-xs font-mono ${
                reportType === r.id
                  ? isDark
                    ? "text-white after:content-[''] after:absolute after:left-0 after:bottom-[-6px] after:w-full after:h-[1px] after:bg-white font-medium"
                    : "text-neutral-900 after:content-[''] after:absolute after:left-0 after:bottom-[-6px] after:w-full after:h-[1px] after:bg-neutral-900 font-semibold"
                  : isDark
                  ? "text-neutral-500 hover:text-neutral-300"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {r.name}
            </button>
            {!SUPPORTED_REPORTS.has(r.id) && (
              <span className="text-[10px] uppercase text-neutral-600">Soon</span>
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
