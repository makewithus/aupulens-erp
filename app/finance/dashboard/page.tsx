"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  FileText,
  Building2,
} from "lucide-react";
import { AIAssistantWidget } from "@/components/dashboard/AIAssistantWidget";
import { StatsRowSkeleton, FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";

interface FinancialSummary {
  totalRevenue: number;
  outstandingReceivables: number;
  outstandingPayables: number;
  currentCashFlow: number;
  overdueInvoices: number;
  overdueBills: number;
}

export default function FinanceDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/finance");
    } else if (status === "authenticated") {
      if (session?.user?.role !== "finance") {
        router.push("/auth/finance");
      } else {
        fetchSummary();
      }
    }
  }, [status, router, session]);

  const fetchSummary = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/finance/summary");
      if (!res.ok) throw new Error("Failed to fetch summary");

      const data = await res.json();
      setSummary(data.summary);
    } catch (err) {
      console.error("Error fetching summary:", err);
      setError("Failed to load financial summary");
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    console.log((amount ?? 0).toLocaleString("en-IN").toString());
    return `₹${(amount ?? 0).toLocaleString("en-IN").toString()}`;
  };

  if (status === "loading" || status === "unauthenticated") {
    return <FullPageLoadingSkeleton />;
  }

  if (isLoading) {
    return (
      <DashboardLayout
        sidebarSections={financeSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Finance"
        pageName="Dashboard Overview"
        profilePath="/finance/profile"
        userName={session?.user?.name || ""}
        userEmail={session?.user?.email}
        userRole={session?.user?.role || "finance"}
        onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      >
        <div className="space-y-6">
          <StatsRowSkeleton count={6} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Dashboard Overview"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Overview" },
      ]}
      profilePath="/finance/profile"
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={fetchSummary}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">
            Finance Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Complete financial management and insights
          </p>
        </div>

        {error && (
          <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-none border border-destructive/20">
            {error}
          </div>
        )}

        {/* Financial Summary Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-blue-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
              <DollarSign className="h-5 w-5 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {summary ? formatCurrency(summary.totalRevenue) : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                <TrendingUp className="h-3 w-3 mr-1 text-blue-500" />
                From paid invoices
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Outstanding Receivables
              </CardTitle>
              <Users className="h-5 w-5 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {summary ? formatCurrency(summary.outstandingReceivables) : "—"}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {summary?.overdueInvoices || 0} overdue invoices
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Outstanding Payables
              </CardTitle>
              <FileText className="h-5 w-5 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {summary ? formatCurrency(summary.outstandingPayables) : "—"}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {summary?.overdueBills || 0} overdue bills
              </p>
            </CardContent>
          </Card>

          <Card
            className={`border-l-4 ${
              summary && summary.currentCashFlow >= 0
                ? "border-l-blue-600"
                : "border-l-red-600"
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Current Cash Flow
              </CardTitle>
              <Building2
                className={`h-5 w-5 ${
                  summary && summary.currentCashFlow >= 0
                    ? "text-blue-600"
                    : "text-red-600"
                }`}
              />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  summary && summary.currentCashFlow >= 0
                    ? "text-blue-600"
                    : "text-red-600"
                }`}
              >
                {summary ? formatCurrency(summary.currentCashFlow) : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                {summary && summary.currentCashFlow >= 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3 mr-1 text-blue-500" />
                    Positive flow
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
                    Negative flow
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card
            className="cursor-pointer hover: -lg transition- "
            onClick={() => router.push("/finance/ledger")}
          >
            <CardHeader>
              <CardTitle className="text-lg text-blue-800">
                General Ledger
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View and manage all financial transactions with advanced filters
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover: -lg transition- "
            onClick={() => router.push("/finance/reconciliation")}
          >
            <CardHeader>
              <CardTitle className="text-lg text-blue-800">
                Bank Reconciliation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Reconcile bank statements with your ledger automatically
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover: -lg transition- "
            onClick={() => router.push("/finance/receivables")}
          >
            <CardHeader>
              <CardTitle className="text-lg text-blue-800">
                Accounts Receivable
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Track customer invoices and manage outstanding payments
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover: -lg transition- "
            onClick={() => router.push("/finance/payables")}
          >
            <CardHeader>
              <CardTitle className="text-lg text-blue-800">
                Accounts Payable
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Manage vendor bills and track payment obligations
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover: -lg transition- "
            onClick={() => router.push("/finance/assets")}
          >
            <CardHeader>
              <CardTitle className="text-lg text-blue-800">
                Fixed Assets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Track company assets and calculate depreciation
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover: -lg transition- "
            onClick={() => router.push("/finance/reports")}
          >
            <CardHeader>
              <CardTitle className="text-lg text-blue-800">
                Financial Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Generate balance sheets, P&L statements, and cash flow reports
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover: -lg transition- "
            onClick={() => router.push("/finance/tax")}
          >
            <CardHeader>
              <CardTitle className="text-lg text-blue-600">
                GST/Tax Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Automate GST calculations and generate tax reports
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover: -lg transition- "
            onClick={() => router.push("/finance/ai-assistant")}
          >
            <CardHeader>
              <CardTitle className="text-lg text-blue-600">
                AI Finance Assistant
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Ask questions about your finances in natural language
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
