"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import {
  FileText,
  Download,
  BarChart,
  RefreshCw,
  CheckCircle2,
  Printer,
  FileBarChart,
  TrendingUp,
  Package,
  Factory,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { toast } from "sonner";

const reportTypes = [
  {
    value: "balance",
    label: "Balance Sheet",
    icon: FileBarChart,
    color: "text-teal-600",
  },
  {
    value: "customers",
    label: "Customer Listing",
    icon: TrendingUp,
    color: "text-blue-600",
  },
  {
    value: "finance",
    label: "Financial Summary",
    icon: FileBarChart,
    color: "text-emerald-600",
  },
  {
    value: "ledger",
    label: "General Ledger",
    icon: FileBarChart,
    color: "text-green-600",
  },
  {
    value: "inventory",
    label: "Inventory Health",
    icon: Package,
    color: "text-amber-600",
  },
  {
    value: "manufacturing",
    label: "Manufacturing Status",
    icon: Factory,
    color: "text-indigo-600",
  },
  {
    value: "products",
    label: "Product Catalog",
    icon: Package,
    color: "text-purple-600",
  },
  {
    value: "pl",
    label: "Profit & Loss Statement",
    icon: FileBarChart,
    color: "text-green-600",
  },
  {
    value: "sales",
    label: "Sales Performance",
    icon: TrendingUp,
    color: "text-blue-600",
  },
  {
    value: "stock",
    label: "Stock Report",
    icon: Package,
    color: "text-orange-600",
  },
  {
    value: "warehouse",
    label: "Warehouse Status",
    icon: Factory,
    color: "text-cyan-600",
  },
];

const dateRanges = [
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
];

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const [reportType, setReportType] = useState("sales");
  const [dateRange, setDateRange] = useState("last_30_days");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedReport(null);

    try {
      const response = await fetch("/api/admin/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: reportType, range: dateRange }),
      });

      const data = await response.json();

      if (response.ok) {
        setGeneratedReport(data);
        toast.success("Report generated successfully!");
      } else {
        throw new Error(data.error || "Failed to generate report");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    const reportContent = document.getElementById("report-content");
    if (!reportContent) return;

    const printWindow = window.open("", "", "width=800,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Report - ${reportType}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              margin: 0;
              padding: 20px;
              color: black;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            th, td {
              border: 1px solid #000;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
            }
            .border-b-2 {
              border-bottom: 2px solid #000;
            }
            .font-bold {
              font-weight: bold;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            .mb-8 {
              margin-bottom: 2rem;
            }
            .mb-6 {
              margin-bottom: 1.5rem;
            }
            .mb-4 {
              margin-bottom: 1rem;
            }
            .mb-2 {
              margin-bottom: 0.5rem;
            }
            .mt-2 {
              margin-top: 0.5rem;
            }
            .mt-1 {
              margin-top: 0.25rem;
            }
            .py-3 {
              padding-top: 0.75rem;
              padding-bottom: 0.75rem;
            }
            .py-4 {
              padding-top: 1rem;
              padding-bottom: 1rem;
            }
            .px-4 {
              padding-left: 1rem;
              padding-right: 1rem;
            }
            .pb-2 {
              padding-bottom: 0.5rem;
            }
            .text-2xl {
              font-size: 1.5rem;
            }
            .text-xl {
              font-size: 1.25rem;
            }
            .text-lg {
              font-size: 1.125rem;
            }
            .text-sm {
              font-size: 0.875rem;
            }
            .italic {
              font-style: italic;
            }
            .capitalize {
              text-transform: capitalize;
            }
            ul {
              list-style-type: disc;
              padding-left: 1.5rem;
            }
            li {
              margin-bottom: 0.75rem;
            }
            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          ${reportContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const selectedReport = reportTypes.find((r) => r.value === reportType);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin">
          <RefreshCw className="h-8 w-8" />
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin"
      pageName="Reports"
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Reports" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      profilePath="/admin/profile"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-4xl font-black uppercase tracking-tighter text-primary">
            Business Reports
          </h1>
          <p className="text-sm font-bold text-muted-foreground uppercase opacity-60 tracking-wider">
            Generate comprehensive reports across all modules
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Panel */}
          <Card className="none-4xl border-2 shadow-xl">
            <div className="p-6 border-b-2 bg-muted/30">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight">
                    Report Configuration
                  </h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                    Select parameters to generate
                  </p>
                </div>
              </div>
            </div>
            <CardContent className="p-6 space-y-6">
              {/* Report Type */}
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Report Type
                </label>
                <SelectSearchAdd
                  items={reportTypes}
                  value={reportType}
                  onValueChange={setReportType}
                  keyField="value"
                  labelField="label"
                  placeholder="Select Report Type"
                  searchPlaceholder="Search reports..."
                  emptyMessage="No reports found"
                  className="none-xl h-12 border-2"
                />
              </div>

              {/* Date Range */}
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Date Range
                </label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="none-xl h-12 border-2 font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dateRanges.map((range) => (
                      <SelectItem key={range.value} value={range.value}>
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full none-xl h-12 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Generate Report
                  </>
                )}
              </Button>

              {/* Report Info */}
              {selectedReport && (
                <div className="p-4 none-xl bg-muted/30 border-2">
                  <div className="flex items-center gap-3 mb-2">
                    <selectedReport.icon
                      className={`h-5 w-5 ${selectedReport.color}`}
                    />
                    <p className="text-sm font-black uppercase">
                      {selectedReport.label}
                    </p>
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground">
                    Comprehensive analysis with key metrics, trends, and
                    actionable insights
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview Area */}
          <div className="lg:col-span-2">
            {generatedReport ? (
              <div className="space-y-4">
                {/* Print Button */}
                <div className="flex justify-end gap-2 print:hidden">
                  <Button
                    variant="outline"
                    onClick={handlePrint}
                    className="none-xl h-10 font-black uppercase text-xs"
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Print / PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setGeneratedReport(null)}
                    className="none-xl h-10 font-black uppercase text-xs"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    New Report
                  </Button>
                </div>

                {/* Report Content */}
                <Card
                  id="report-content"
                  className="none-4xl border-2 shadow-xl bg-white print:shadow-none print:border-0"
                >
                  <div className="p-8 border-b-2 print:pb-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900">
                          Aupulens ERP
                        </h1>
                        <p className="text-sm font-bold text-gray-500 uppercase mt-1">
                          Business Intelligence Report
                        </p>
                      </div>
                      <div className="text-right">
                        <h2 className="text-xl font-black text-black capitalize">
                          {reportType.replace("_", " ")} Report
                        </h2>
                        <p className="text-sm text-gray-500 font-bold mt-1">
                          {new Date().toLocaleDateString("en-IN", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <CardContent className="p-8">
                    <div
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: generatedReport.htmlContent,
                      }}
                    />
                  </CardContent>

                  <div className="px-8 py-4 border-t bg-muted/10 print:bg-white">
                    <p className="text-center text-xs text-gray-400 font-bold uppercase">
                      Generated by Aupulens ERP • Confidential • Internal Use
                      Only
                    </p>
                  </div>
                </Card>
              </div>
            ) : (
              <Card className="none-4xl border-2 border-dashed h-full min-h-[600px] flex flex-col items-center justify-center text-center">
                <BarChart className="h-24 w-24 text-muted-foreground/20 mb-6" />
                <h3 className="text-xl font-black uppercase tracking-tight text-muted-foreground mb-2">
                  No Report Generated
                </h3>
                <p className="text-sm font-bold text-muted-foreground/60 uppercase">
                  Select parameters and click generate
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
