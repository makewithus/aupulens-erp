"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Q2C_STATUS,
  Q2C_STATUS_LABELS,
  Q2C_FLOW_STEPS,
  type Q2CStatus,
} from "@/lib/constants/statuses";
import { PipelineHeader } from "@/components/sales/pipeline/PipelineHeader";
import { PipelineStats } from "@/components/sales/pipeline/PipelineStats";
import { PipelineBoard } from "@/components/sales/pipeline/PipelineBoard";
import { LostDeals } from "@/components/sales/pipeline/LostDeals";
import { CancelledDeals } from "@/components/sales/pipeline/CancelledDeals";

export default function Q2CPipelinePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sales/sale-orders");
      const json = await res.json();
      setData(json.items || []);
    } catch (error) {
      console.error("Error loading pipeline:", error);
      toast.error("Failed to load pipeline data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleQ2CTransition = async (orderId: string, nextStatus: string) => {
    try {
      const res = await fetch(`/api/sales/sale-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q2cStatus: nextStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Transition failed");
      }

      toast.success(`Moved to ${Q2C_STATUS_LABELS[nextStatus as Q2CStatus]}`);
      load();
      setSelectedOrder(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const filtered = data.filter((o) => {
    if (!query) return true;
    return [o.header?.name, o.header?.partnerId?.header?.name || ""].some((v) =>
      v?.toLowerCase().includes(query.toLowerCase()),
    );
  });

  // Group by Q2C status
  const groupedByStage: Record<string, any[]> = {};
  for (const step of Q2C_FLOW_STEPS) {
    groupedByStage[step] = [];
  }
  groupedByStage[Q2C_STATUS.LOST] = [];
  groupedByStage[Q2C_STATUS.CANCELLED] = [];

  for (const order of filtered) {
    const stage = order.q2cStatus || Q2C_STATUS.LEAD;
    if (groupedByStage[stage]) {
      groupedByStage[stage].push(order);
    } else {
      groupedByStage[Q2C_STATUS.LEAD].push(order);
    }
  }

  // Summary stats
  const totalValue = filtered.reduce(
    (sum, o) => sum + (o.totals?.amountTotal || 0),
    0,
  );
  const activeDeals = filtered.filter(
    (o) =>
      o.q2cStatus !== Q2C_STATUS.LOST &&
      o.q2cStatus !== Q2C_STATUS.CANCELLED &&
      o.q2cStatus !== Q2C_STATUS.REVENUE_RECOGNIZED,
  ).length;
  const wonDeals = filtered.filter(
    (o) => o.q2cStatus === Q2C_STATUS.REVENUE_RECOGNIZED,
  ).length;
  const lostDeals = filtered.filter(
    (o) => o.q2cStatus === Q2C_STATUS.LOST,
  ).length;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Q2C Pipeline"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Q2C Pipeline" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "sales"}
      onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        {/* Header */}
        <PipelineHeader query={query} setQuery={setQuery} />

        {/* Summary Stats */}
        <PipelineStats
          totalValue={totalValue}
          activeDeals={activeDeals}
          wonDeals={wonDeals}
          lostDeals={lostDeals}
        />

        {/* Board */}
        {loading ? (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-6 min-w-max">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-72 shrink-0 flex flex-col gap-4">
                  <div className="border-b border-border/20 pb-3.5">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3.5 w-16 mt-2" />
                  </div>
                  <div className="border border-border/20 p-4 space-y-3 bg-white/[0.01] h-[400px]">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <PipelineBoard
            groupedByStage={groupedByStage}
            selectedOrder={selectedOrder}
            setSelectedOrder={setSelectedOrder}
            handleQ2CTransition={handleQ2CTransition}
            formatCurrency={formatCurrency}
          />
        )}

        {/* Lost & Cancelled Deals summaries */}
        {(groupedByStage[Q2C_STATUS.LOST]?.length > 0 ||
          groupedByStage[Q2C_STATUS.CANCELLED]?.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <LostDeals
              orders={groupedByStage[Q2C_STATUS.LOST]}
              handleQ2CTransition={handleQ2CTransition}
              formatCurrency={formatCurrency}
            />
            <CancelledDeals
              orders={groupedByStage[Q2C_STATUS.CANCELLED]}
              formatCurrency={formatCurrency}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
