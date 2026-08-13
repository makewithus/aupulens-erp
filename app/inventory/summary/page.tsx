"use client";

import { useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Package,
  AlertCircle,
  ShoppingCart,
  Warehouse,
  ArrowUpRight,
} from "lucide-react";
import {
  StatsRowSkeleton,
  TableSkeleton,
  FullPageLoadingSkeleton,
} from "@/components/ui/loading-skeletons";
import { AIAssistantWidget } from "@/components/dashboard/AIAssistantWidget";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";

interface InventorySummary {
  totalItems: {
    current: number;
    change: number;
  };
  totalValue: {
    current: number;
    change: number;
  };
  lowStock: {
    current: number;
    change: number;
  };
  operations: {
    receipts: number;
    deliveries: number;
    manufacturing: number;
  };
}

export default function InventorySummaryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<InventorySummary | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      if (
        session?.user?.role !== "inventory" &&
        session?.user?.role !== "admin"
      ) {
        router.push("/auth/inventory");
      }
    }
  }, [status, router, session]);

  const fetchSummary = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await cachedFetch("/api/inventory/summary");
      if (!res.ok) throw new Error("Failed to fetch summary");
      const data = await res.json();
      setSummary(data.summary);
      setError("");
    } catch (err) {
      console.error("Error fetching summary:", err);
      setError("Failed to load inventory summary");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchSummary();
    }
  }, [status, fetchSummary]);

  const formatCurrency = (amount?: number) => {
    const value = typeof amount === "number" && !isNaN(amount) ? amount : 0;
    return `₹${value.toLocaleString("en-IN")}`;
  };

  const formatPercentage = (change?: number) => {
    const value = typeof change === "number" && !isNaN(change) ? change : 0;
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  if (status === "loading" || status === "unauthenticated") {
    return <FullPageLoadingSkeleton />;
  }

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Dashboard"
      pageName="Inventory Summary"
      breadcrumbs={[
        { label: "Dashboard", href: "/inventory/summary" },
        { label: "Summary" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={fetchSummary}
      profilePath="/inventory/profile"
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            Inventory Summary
          </h1>
        </div>

        {error && (
          <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-none">
            {error}
          </div>
        )}

        {isLoading ? (
          <StatsRowSkeleton count={3} />
        ) : summary ? (
          <>
            <div className="grid grid-cols-1 gap-1 md:grid-cols-3">
              <StatCard
                title="Total Items"
                value={summary.totalItems?.current.toLocaleString()}
                visual={<UsersGraph/>}
                subtitle="Products in inventory"
              />

              <StatCard
                title="Inventory Value"
                value={formatCurrency(summary.totalValue?.current)}
                subtitle="Based on standard cost"
                visual={<UsersGraph/>}
              />

              <StatCard
                title="Low Stock"
                value={summary.lowStock?.current}
                subtitle="Below threshold"
                visual={<UsersGraph/>}
              />
            </div>

            {/* Operations Metrics */}
            <h2 className="mt-6 text-[30px] font-medium tracking-[-0.05em]">
              Operations
            </h2>

            <div className="grid grid-cols-1 gap-1 md:grid-cols-3">
              <div onClick={() => router.push("/inventory/operations/receipts")}>
                <StatCard
                  className="cursor-pointer hover:bg-muted/20"
                  title="Receipts"
                  value={summary.operations?.receipts}
                  subtitle="Awaiting processing"
                  rightContent={
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  }
                />
              </div>

              <div onClick={() => router.push("/inventory/operations/deliveries")}>
                <StatCard
                  className="cursor-pointer hover:bg-muted/20"
                  title="Deliveries"
                  value={summary.operations?.deliveries}
                  subtitle="Ready for dispatch"
                  rightContent={
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  }
                />
              </div>

              <div onClick={() => router.push("/inventory/operations/manufacturing")}>
                <StatCard
                  className="cursor-pointer hover:bg-muted/20"
                  title="Manufacturing"
                  value={summary.operations?.manufacturing}
                  subtitle="Orders awaiting production"
                  rightContent={
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No inventory data available
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
