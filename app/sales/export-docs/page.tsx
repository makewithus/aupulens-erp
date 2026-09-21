"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import { buildExportDocPdf, type ExportDocType } from "@/lib/sales/exportDocPdf";
import { cachedFetch } from "@/lib/api/cachedFetch";

interface SalesOrder {
  _id: string;
  orderNumber: string;
  customer: string;
  customerEmail?: string;
  items: { description: string; quantity: number; price: number; amount: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: string;
  shippingAddress?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  sales_order: "text-blue-500",
  fulfillment: "text-blue-500",
  invoice_posted: "text-emerald-500",
  revenue_recognized: "text-emerald-500",
};

// Stages at which an order is confirmed and can be shipped/exported.
const EXPORTABLE_STAGES = ["quote_accepted", "sales_order", "fulfillment", "invoice_posted", "revenue_recognized"];

function normalizeOrder(o: any): SalesOrder {
  const lines: any[] = o.orderLines || [];
  const partner = o.header?.partnerId;
  const shipping = (partner?.addresses || []).find((a: any) => a.type === "shipping") || (partner?.addresses || [])[0] || {};
  const address = [shipping.street, shipping.street2, shipping.city, shipping.state_name, shipping.zip, shipping.country]
    .filter(Boolean)
    .join(", ");
  return {
    _id: o._id,
    orderNumber: o.header?.name || "—",
    customer: partner?.header?.name || "Unknown customer",
    customerEmail: partner?.contact_details?.email,
    items: lines.map((l) => ({
      description: l.name,
      quantity: Number(l.productQty) || 0,
      price: Number(l.priceUnit) || 0,
      amount: Number(l.priceSubtotal) || (Number(l.productQty) || 0) * (Number(l.priceUnit) || 0),
    })),
    subtotal: o.totals?.amountUntaxed || 0,
    taxRate: 0,
    taxAmount: o.totals?.amountTax || 0,
    total: o.totals?.amountTotal || 0,
    status: o.q2cStatus || o.status,
    shippingAddress: address || undefined,
    createdAt: o.header?.dateOrder || o.createdAt,
  };
}

export default function ExportDocsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exportingDoc, setExportingDoc] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/sales");
    } else if (
      status === "authenticated" &&
      session?.user?.role !== "sales" &&
      session?.user?.role !== "admin"
    ) {
      router.push("/auth/sales");
    }
  }, [status, router, session]);

  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await cachedFetch("/api/sales/sale-orders");
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      // Export documents only make sense once an order is confirmed.
      const exportable = (data.items || []).filter((o: any) =>
        EXPORTABLE_STAGES.includes(o.q2cStatus) || ["sale", "done", "posted"].includes(o.status),
      );
      setOrders(exportable.map(normalizeOrder));
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("We couldn't load your orders. Please refresh the page.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchOrders();
    }
  }, [status, fetchOrders]);

  const downloadDoc = async (
    type: ExportDocType,
    key: string,
    label: string,
    filePrefix: string,
    order: SalesOrder,
  ) => {
    setExportingDoc(`${key}-${order._id}`);
    try {
      if (order.items.length === 0) {
        toast.error(`${order.orderNumber} has no line items, so a ${label} can't be generated.`);
        return;
      }
      const bytes = await buildExportDocPdf(type, order);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filePrefix}_${order.orderNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${label} downloaded`, { description: `Document for order ${order.orderNumber}` });
    } catch (error) {
      console.error(`Error generating ${label}:`, error);
      toast.error(`We couldn't generate the ${label}. Please try again.`);
    } finally {
      setExportingDoc(null);
    }
  };

  const generateBillOfLading = (order: SalesOrder) => downloadDoc("bill-of-lading", "bl", "Bill of Lading", "BL", order);

  const generateCommercialInvoice = (order: SalesOrder) => downloadDoc("commercial-invoice", "ci", "Commercial Invoice", "CommercialInvoice", order);

  const generatePackingList = (order: SalesOrder) => downloadDoc("packing-list", "pl", "Packing List", "PackingList", order);

  if (status === "loading" || isLoading) {
    return (
      <DashboardLayout
        sidebarSections={salesSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Sales"
        pageName="Export Documentation"
        breadcrumbs={[
          { label: "Sales", href: "/sales/summary" },
          { label: "Export Docs" },
        ]}
        userName={session?.user?.name || "User"}
        userRole={session?.user?.role || "sales"}
        onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
        profileHref="/sales/profile"
      >
        <TableSkeleton />
      </DashboardLayout>
    );
  }

  if (!session) return null;

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Export Documentation"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Export Docs" },
      ]}
      userName={session?.user?.name || "User"}
      userRole={session?.user?.role || "sales"}
      onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      profileHref="/sales/profile"
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            Export Documentation
          </h1>
        </div>

        {/* Info Grid */}
        <div className="grid gap-6 md:grid-cols-3 mb-6">
          {/* Bill of Lading Card */}
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none p-6">
            <div className="flex flex-col justify-between h-full">
              <div>
                <h4 className="text-lg font-medium text-foreground">
                  Bill of Lading
                </h4>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 mt-1">
                  Shipping Documents
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Generate Bill of Lading for international shipments with detailed
                  cargo information.
                </p>
              </div>
              <div className="text-3xl font-mono font-bold text-blue-500 mt-6">
                <span className="font-sans tabular-nums">{orders.length}</span> available
              </div>
            </div>
          </Card>

          {/* Commercial Invoice Card */}
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none p-6">
            <div className="flex flex-col justify-between h-full">
              <div>
                <h4 className="text-lg font-medium text-foreground">
                  Commercial Invoice
                </h4>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 mt-1">
                  Export Invoices
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Create commercial invoices for customs clearance and international
                  trade compliance.
                </p>
              </div>
              <div className="text-3xl font-mono font-bold text-emerald-500 mt-6">
                <span className="font-sans tabular-nums">{orders.length}</span> available
              </div>
            </div>
          </Card>

          {/* Packing List Card */}
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none p-6">
            <div className="flex flex-col justify-between h-full">
              <div>
                <h4 className="text-lg font-medium text-foreground">
                  Packing List
                </h4>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 mt-1">
                  Itemized Details
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Generate detailed packing lists with item specifications and
                  package information.
                </p>
              </div>
              <div className="text-3xl font-mono font-bold text-violet-500 mt-6">
                <span className="font-sans tabular-nums">{orders.length}</span> available
              </div>
            </div>
          </Card>
        </div>

        {/* Main Orders Card */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div>
              <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
                Exportable Orders
              </h3>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                {orders.length} {orders.length === 1 ? "Order" : "Orders"} Available for Export
              </p>
            </div>
          </div>

          <CardContent className="p-0">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">
                  No exportable orders found
                </p>
                <p className="text-xs text-muted-foreground/50 mt-1 max-w-sm">
                  Export documents become available once a deal reaches Quote Accepted or a later stage of the Q2C pipeline.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {orders.map((order) => (
                  <div key={order._id} className="p-8 hover:bg-muted/10 transition-colors">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <h4 className="text-lg font-medium text-foreground">
                          {order.orderNumber}
                        </h4>
                        <Badge
                          className={`
                            rounded-none
                            border-0
                            bg-transparent
                            px-0
                            font-mono
                            text-[11px]
                            hover:bg-transparent
                            shadow-none
                            ${STATUS_COLORS[order.status] ?? "text-muted-foreground"}
                          `}
                        >
                          {String(order.status).replace(/_/g, " ")}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-1">
                        <div className="text-muted-foreground">
                          Customer:{" "}
                          <span className="text-foreground font-medium">
                            {order.customer}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          Date:{" "}
                          <span className="text-foreground font-medium">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="text-sm text-muted-foreground font-mono mt-1">
                        {order.items.length}{" "}
                        {order.items.length === 1 ? "item" : "items"} • Total: ₹
                        {order.total.toLocaleString("en-IN")}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-4 border-t border-border/10 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-none text-xs h-9 px-4 text-blue-500 hover:bg-white/5 border-border/40 font-medium"
                          onClick={() => generateBillOfLading(order)}
                          disabled={exportingDoc === `bl-${order._id}`}
                        >
                          {exportingDoc === `bl-${order._id}`
                            ? "Generating..."
                            : "Bill of Lading"}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-none text-xs h-9 px-4 text-emerald-500 hover:bg-white/5 border-border/40 font-medium"
                          onClick={() => generateCommercialInvoice(order)}
                          disabled={exportingDoc === `ci-${order._id}`}
                        >
                          {exportingDoc === `ci-${order._id}`
                            ? "Generating..."
                            : "Commercial Invoice"}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-none text-xs h-9 px-4 text-violet-500 hover:bg-white/5 border-border/40 font-medium"
                          onClick={() => generatePackingList(order)}
                          disabled={exportingDoc === `pl-${order._id}`}
                        >
                          {exportingDoc === `pl-${order._id}`
                            ? "Generating..."
                            : "Packing List"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
