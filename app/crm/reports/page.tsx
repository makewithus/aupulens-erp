'use client';

import { useState } from "react";
import { BarChart, LineChart, PieChart, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as xlsx from "xlsx";

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
          <Button variant="outline" className="text-xs h-8" disabled={isExporting} onClick={() => handleExport("csv")}>
            <Download className="w-3 h-3 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" className="text-xs h-8" disabled={isExporting} onClick={() => handleExport("xlsx")}>
            <Download className="w-3 h-3 mr-2" /> Export XLSX
          </Button>
          <Button className="bg-primary text-xs h-8" onClick={handleSaveReport}>Save Report</Button>
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
                {!SUPPORTED_REPORTS.has(r.id) && (
                  <span className="ml-auto text-[10px] uppercase text-neutral-600">Soon</span>
                )}
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
            {SUPPORTED_REPORTS.has(reportType)
              ? "Use Export CSV or Export XLSX above to download this report from real, live CRM data."
              : "This report type doesn't have a data source wired up yet — export is disabled until it does."}
          </p>
        </div>
      </div>
    </div>
  );
}
