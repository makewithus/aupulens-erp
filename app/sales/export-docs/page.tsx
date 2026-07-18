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
  shipped: "text-blue-500",
  delivered: "text-emerald-500",
};

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
      const response = await fetch("/api/sales/orders");
      if (response.ok) {
        const data = await response.json();
        // Only show shipped and delivered orders for export docs
        const exportableOrders = (data.items || []).filter((order: SalesOrder) =>
          ["shipped", "delivered"].includes(order.status),
        );
        setOrders(exportableOrders);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchOrders();
    }
  }, [status, fetchOrders]);

  const generateBillOfLading = async (order: SalesOrder) => {
    setExportingDoc(`bl-${order._id}`);
    try {
      const doc = {
        documentType: "Bill of Lading",
        orderNumber: order.orderNumber,
        date: new Date().toLocaleDateString(),
        shipper: "Aupulens Enterprises",
        consignee: order.customer,
        address: order.shippingAddress || "N/A",
        items: order.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          weight: "TBD",
        })),
        total: order.total,
        generatedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(doc, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BL_${order.orderNumber}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Bill of Lading Generated", {
        description: `Document for order ${order.orderNumber} has been downloaded`,
      });
    } catch (error) {
      console.error("Error generating B/L:", error);
      toast.error("Failed to generate Bill of Lading");
    } finally {
      setExportingDoc(null);
    }
  };

  const generateCommercialInvoice = async (order: SalesOrder) => {
    setExportingDoc(`ci-${order._id}`);
    try {
      const doc = {
        documentType: "Commercial Invoice",
        invoiceNumber: `CI-${order.orderNumber}`,
        date: new Date().toLocaleDateString(),
        seller: {
          name: "Aupulens Enterprises",
          address: "Export Division, International Trade Center",
        },
        buyer: {
          name: order.customer,
          email: order.customerEmail,
          address: order.shippingAddress,
        },
        items: order.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.price,
          amount: item.amount,
        })),
        subtotal: order.subtotal,
        taxRate: order.taxRate,
        taxAmount: order.taxAmount,
        total: order.total,
        currency: "USD",
        paymentTerms: "Net 30",
        generatedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(doc, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CommercialInvoice_${order.orderNumber}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Commercial Invoice Generated", {
        description: `Invoice for order ${order.orderNumber} has been downloaded`,
      });
    } catch (error) {
      console.error("Error generating invoice:", error);
      toast.error("Failed to generate Commercial Invoice");
    } finally {
      setExportingDoc(null);
    }
  };

  const generatePackingList = async (order: SalesOrder) => {
    setExportingDoc(`pl-${order._id}`);
    try {
      const doc = {
        documentType: "Packing List",
        listNumber: `PL-${order.orderNumber}`,
        date: new Date().toLocaleDateString(),
        shipper: "Aupulens Enterprises",
        consignee: order.customer,
        orderReference: order.orderNumber,
        items: order.items.map((item, index) => ({
          packageNumber: index + 1,
          description: item.description,
          quantity: item.quantity,
          weight: "TBD",
          dimensions: "TBD",
          marks: `PKG-${index + 1}`,
        })),
        totalPackages: order.items.length,
        totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
        generatedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(doc, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PackingList_${order.orderNumber}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Packing List Generated", {
        description: `Packing list for order ${order.orderNumber} has been downloaded`,
      });
    } catch (error) {
      console.error("Error generating packing list:", error);
      toast.error("Failed to generate Packing List");
    } finally {
      setExportingDoc(null);
    }
  };

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
      <div className="space-y-1">
        {/* Page Header Spacer */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2"></div>

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
                {orders.length} available
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
                {orders.length} available
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
                {orders.length} available
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
                  Orders must be in &ldquo;shipped&rdquo; or &ldquo;delivered&rdquo; status to generate export documents.
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
                          {order.status}
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
                        {order.items.length === 1 ? "item" : "items"} • Total: $
                        {order.total.toLocaleString()}
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
