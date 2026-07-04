"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import {
  StatsRowSkeleton,
  TableSkeleton,
  FullPageLoadingSkeleton,
} from "@/components/ui/loading-skeletons";
import { AIAssistantWidget } from "@/components/dashboard/AIAssistantWidget";

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
    if (status === "unauthenticated") {
      router.push("/auth/inventory");
    } else if (status === "authenticated") {
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
      const res = await fetch("/api/inventory/summary");
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
          <h1 className="text-3xl font-bold text-foreground">
            Inventory Summary
          </h1>
          <p className="mt-2 text-muted-foreground">
            Overview of your inventory and warehouse operations
          </p>
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
            {/* General Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Items
                  </CardTitle>
                  <Package className="h-4 w-4 text-blue-800" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {summary.totalItems?.current.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Total Products
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Asset Value
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(summary.totalValue?.current)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Based on standard cost
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Low Stock Alerts
                  </CardTitle>
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {summary.lowStock?.current}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Items below reorder level (5)
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Operations Metrics */}
            <h2 className="text-xl font-semibold mt-6 mb-4">
              Operations to Process
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push("/inventory/operations/receipts")}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Receipts
                  </CardTitle>
                  <Warehouse className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {summary.operations?.receipts}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Incoming transfers pending
                  </div>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push("/inventory/operations/deliveries")}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Deliveries
                  </CardTitle>
                  <ShoppingCart className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {summary.operations?.deliveries}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Outgoing transfers pending
                  </div>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() =>
                  router.push("/inventory/operations/manufacturing")
                }
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Manufacturing
                  </CardTitle>
                  <Package className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {summary.operations?.manufacturing}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Orders in progress/confirmed
                  </div>
                </CardContent>
              </Card>
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
