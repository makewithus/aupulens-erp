"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function statusColor(status: string) {
  switch (status) {
    case "confirmed":
    case "approved":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800";
    case "pending_approval":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800";
    case "on_hold":
      return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800";
    case "void":
    case "closed":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800";
    default:
      return "bg-accent text-muted-foreground border-border dark:bg-accent dark:border-border";
  }
}

export default function SalesOrderDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/sales-orders/${id}`);
      const data = await res.json();
      if (data.success) setOrder(data.data);
      else toast.error(data.message || "Failed to load sales order");
    } catch {
      toast.error("Failed to load sales order");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const patch = async (body: Record<string, any>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/sales-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Update failed");
      setOrder(data.data);
      toast.success("Sales order updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const convertToInvoice = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/sales-orders/${id}/convert-to-invoice`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to convert to invoice");
      toast.success("Converted to invoice");
      router.push(`/sales/invoices/${data.data.invoice._id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Sales Order"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Sales Orders", href: "/sales/sales-orders" },
        { label: order?.header?.name || "Detail" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : !order ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Sales order not found</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">{order.header?.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {order.header?.partnerId?.header?.displayName || order.header?.partnerId?.header?.name}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-none border capitalize ${statusColor(order.salesOrderStatus)}`}>
                {order.salesOrderStatus?.replace("_", " ")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 border rounded-none p-4 text-sm">
              <div>
                <p className="text-muted-foreground">Amount</p>
                <p className="font-medium">₹{Number(order.totals?.amountTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Shipment Status</p>
                <p className="font-medium capitalize">{order.shipmentStatus?.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Invoicing Status</p>
                <p className="font-medium capitalize">{order.invoicingStatus?.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expected Shipment Date</p>
                <p className="font-medium">
                  {order.expectedShipmentDate ? new Date(order.expectedShipmentDate).toLocaleDateString("en-IN") : "—"}
                </p>
              </div>
            </div>

            <div className="border rounded-none">
              <div className="p-3 border-b bg-muted/30 font-semibold text-sm">Items</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.orderLines?.map((line: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{line.name}</TableCell>
                      <TableCell>{line.productQty}</TableCell>
                      <TableCell>{Number(line.priceUnit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">
                        {Number(line.priceSubtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {order.salesInvoiceIds?.length > 0 && (
              <div className="border rounded-none">
                <div className="p-3 border-b bg-muted/30 font-semibold text-sm">Invoices</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.salesInvoiceIds.map((inv: any) => (
                      <TableRow
                        key={inv._id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => router.push(`/sales/invoices/${inv._id}`)}
                      >
                        <TableCell>{inv.number}</TableCell>
                        <TableCell className="capitalize">{inv.status}</TableCell>
                        <TableCell className="text-right">
                          ₹{Number(inv.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {order.salesOrderStatus === "draft" && (
                <Button disabled={busy} onClick={() => patch({ salesOrderStatus: "confirmed" })}>
                  Confirm Sales Order
                </Button>
              )}
              {order.salesOrderStatus === "confirmed" && order.shipmentStatus !== "fulfilled" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    patch({
                      shipmentStatus:
                        order.shipmentStatus === "not_shipped"
                          ? "shipped"
                          : order.shipmentStatus === "shipped"
                            ? "fulfilled"
                            : "fulfilled",
                    })
                  }
                >
                  {order.shipmentStatus === "not_shipped" ? "Mark as Shipped" : "Mark as Fulfilled"}
                </Button>
              )}
              {order.invoicingStatus !== "invoiced" && (
                <Button variant="outline" disabled={busy} onClick={convertToInvoice}>
                  Convert to Invoice
                </Button>
              )}
              {order.salesOrderStatus !== "on_hold" && order.salesOrderStatus !== "void" && order.salesOrderStatus !== "closed" && (
                <Button variant="outline" disabled={busy} onClick={() => patch({ salesOrderStatus: "on_hold" })}>
                  Put On Hold
                </Button>
              )}
              {order.salesOrderStatus !== "void" && order.salesOrderStatus !== "closed" && (
                <Button variant="outline" disabled={busy} onClick={() => patch({ salesOrderStatus: "void" })}>
                  Void
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
