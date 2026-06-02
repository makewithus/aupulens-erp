"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Search,
  ChevronRight,
  ArrowRight,
  Eye,
  TrendingUp,
  DollarSign,
  Target,
  FileText,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
} from "lucide-react";
import {
  Q2C_STATUS,
  Q2C_STATUS_LABELS,
  Q2C_STATUS_COLORS,
  Q2C_FLOW_STEPS,
  getNextQ2CStatuses,
  type Q2CStatus,
} from "@/lib/constants/statuses";

const Q2C_STAGE_ICONS: Record<string, any> = {
  [Q2C_STATUS.LEAD]: Target,
  [Q2C_STATUS.OPPORTUNITY]: TrendingUp,
  [Q2C_STATUS.PRICE_APPLIED]: DollarSign,
  [Q2C_STATUS.QUOTE_GENERATED]: FileText,
  [Q2C_STATUS.DISCOUNT_APPROVAL]: Clock,
  [Q2C_STATUS.QUOTE_ACCEPTED]: CheckCircle2,
  [Q2C_STATUS.SALES_ORDER]: FileText,
  [Q2C_STATUS.FULFILLMENT]: Truck,
  [Q2C_STATUS.INVOICE_POSTED]: DollarSign,
  [Q2C_STATUS.REVENUE_RECOGNIZED]: CheckCircle2,
};

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
    if (status === "unauthenticated") router.push("/auth/sales");
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

  const getCurrentStepIndex = (q2cStatus: string) => {
    return Q2C_FLOW_STEPS.indexOf(q2cStatus as Q2CStatus);
  };

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quote-to-Cash Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              Track deals from Lead to Revenue Recognition
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search deals..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 w-64 bg-background"
            />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Pipeline Value
                  </p>
                  <p className="text-lg font-bold">{formatCurrency(totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Target className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Deals</p>
                  <p className="text-lg font-bold">{activeDeals}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Won</p>
                  <p className="text-lg font-bold">{wonDeals}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lost</p>
                  <p className="text-lg font-bold">{lostDeals}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Board */}
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
              {Q2C_FLOW_STEPS.map((stage, stageIdx) => {
                const orders = groupedByStage[stage] || [];
                const colors = Q2C_STATUS_COLORS[stage];
                const StageIcon = Q2C_STAGE_ICONS[stage] || FileText;
                const stageTotal = orders.reduce(
                  (sum, o) => sum + (o.totals?.amountTotal || 0),
                  0,
                );

                return (
                  <div
                    key={stage}
                    className="w-72 shrink-0 flex flex-col"
                  >
                    {/* Stage Header */}
                    <div
                      className={`${colors.bg} rounded-t-lg px-4 py-3 border border-b-0`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StageIcon className={`h-4 w-4 ${colors.text}`} />
                          <span
                            className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}
                          >
                            {Q2C_STATUS_LABELS[stage]}
                          </span>
                        </div>
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-5 px-1.5"
                        >
                          {orders.length}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(stageTotal)}
                      </p>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 bg-muted/20 border border-t-0 rounded-b-lg p-2 space-y-2 min-h-[200px]">
                      {orders.length === 0 ? (
                        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                          No deals
                        </div>
                      ) : (
                        orders.map((order) => {
                          const nextStatuses = getNextQ2CStatuses(stage);
                          const forwardStatuses = nextStatuses.filter(
                            (s) =>
                              s !== Q2C_STATUS.LOST &&
                              s !== Q2C_STATUS.CANCELLED,
                          );

                          return (
                            <Card
                              key={order._id}
                              className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                              onClick={() =>
                                setSelectedOrder(
                                  selectedOrder?._id === order._id
                                    ? null
                                    : order,
                                )
                              }
                            >
                              <CardContent className="p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-sm truncate">
                                    {order.header.name}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(
                                        `/sales/quotations?view=${order._id}`,
                                      );
                                    }}
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {order.header.partnerId?.header?.name ||
                                    "No customer"}
                                </p>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-bold">
                                    {formatCurrency(
                                      order.totals?.amountTotal || 0,
                                    )}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(
                                      order.createdAt,
                                    ).toLocaleDateString()}
                                  </span>
                                </div>

                                {/* Action buttons when selected */}
                                {selectedOrder?._id === order._id && (
                                  <div className="pt-2 border-t space-y-1.5">
                                    {/* Q2C Flow Progress */}
                                    <div className="flex items-center gap-0.5 mb-2">
                                      {Q2C_FLOW_STEPS.map((s, i) => {
                                        const currentIdx =
                                          getCurrentStepIndex(stage);
                                        const isCompleted = i < currentIdx;
                                        const isCurrent = i === currentIdx;
                                        return (
                                          <div
                                            key={s}
                                            className={`h-1.5 flex-1 rounded-full ${
                                              isCompleted
                                                ? "bg-green-500"
                                                : isCurrent
                                                  ? "bg-blue-500"
                                                  : "bg-muted"
                                            }`}
                                            title={Q2C_STATUS_LABELS[s]}
                                          />
                                        );
                                      })}
                                    </div>

                                    {/* Forward actions */}
                                    {forwardStatuses.map((nextSt) => (
                                      <Button
                                        key={nextSt}
                                        size="sm"
                                        className="w-full h-7 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQ2CTransition(
                                            order._id,
                                            nextSt,
                                          );
                                        }}
                                      >
                                        <ArrowRight className="h-3 w-3 mr-1" />
                                        {Q2C_STATUS_LABELS[nextSt]}
                                      </Button>
                                    ))}

                                    {/* Lost / Cancel */}
                                    <div className="flex gap-1">
                                      {nextStatuses.includes(
                                        Q2C_STATUS.LOST,
                                      ) && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="flex-1 h-7 text-xs text-red-600 hover:text-red-700"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleQ2CTransition(
                                              order._id,
                                              Q2C_STATUS.LOST,
                                            );
                                          }}
                                        >
                                          <XCircle className="h-3 w-3 mr-1" />
                                          Lost
                                        </Button>
                                      )}
                                      {nextStatuses.includes(
                                        Q2C_STATUS.CANCELLED,
                                      ) && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="flex-1 h-7 text-xs text-orange-600 hover:text-orange-700"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleQ2CTransition(
                                              order._id,
                                              Q2C_STATUS.CANCELLED,
                                            );
                                          }}
                                        >
                                          Cancel
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lost & Cancelled Deals */}
        {(groupedByStage[Q2C_STATUS.LOST]?.length > 0 ||
          groupedByStage[Q2C_STATUS.CANCELLED]?.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lost Deals */}
            {groupedByStage[Q2C_STATUS.LOST]?.length > 0 && (
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-red-600 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Lost Deals ({groupedByStage[Q2C_STATUS.LOST].length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {groupedByStage[Q2C_STATUS.LOST].map((order) => (
                    <div
                      key={order._id}
                      className="flex items-center justify-between p-2 rounded bg-red-50 dark:bg-red-900/10"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {order.header.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.header.partnerId?.header?.name || "Unknown"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">
                          {formatCurrency(order.totals?.amountTotal || 0)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            handleQ2CTransition(order._id, Q2C_STATUS.LEAD)
                          }
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Re-open
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Cancelled Deals */}
            {groupedByStage[Q2C_STATUS.CANCELLED]?.length > 0 && (
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-gray-500 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Cancelled ({groupedByStage[Q2C_STATUS.CANCELLED].length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {groupedByStage[Q2C_STATUS.CANCELLED].map((order) => (
                    <div
                      key={order._id}
                      className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-900/20"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {order.header.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.header.partnerId?.header?.name || "Unknown"}
                        </p>
                      </div>
                      <span className="text-sm font-bold">
                        {formatCurrency(order.totals?.amountTotal || 0)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
