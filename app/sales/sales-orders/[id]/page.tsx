"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

const statusColors: Record<string, string> = {
  confirmed: "text-emerald-500",
  approved: "text-emerald-500",
  pending_approval: "text-amber-500",
  on_hold: "text-orange-500",
  void: "text-red-500",
  closed: "text-red-500",
};

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
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !order ? (
          <div className="py-16 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Sales order not found</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tighter text-primary">{order.header?.name}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {order.header?.partnerId?.header?.displayName || order.header?.partnerId?.header?.name}
                </p>
              </div>
              <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[11px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[order.salesOrderStatus] || "text-muted-foreground"}`}>
                {order.salesOrderStatus?.replace("_", " ")}
              </Badge>
            </div>

            <Card className="border border-border/40 shadow-none bg-background rounded-none p-6">
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Amount</p>
                  <p className="font-mono text-foreground mt-1">₹{Number(order.totals?.amountTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Shipment Status</p>
                  <p className="font-medium text-foreground mt-1 capitalize">{order.shipmentStatus?.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Invoicing Status</p>
                  <p className="font-medium text-foreground mt-1 capitalize">{order.invoicingStatus?.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Expected Shipment Date</p>
                  <p className="font-medium text-foreground mt-1">
                    {order.expectedShipmentDate ? new Date(order.expectedShipmentDate).toLocaleDateString("en-IN") : "—"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border border-border/40 shadow-none bg-background rounded-none overflow-hidden">
              <div className="px-6 py-4 border-b border-border/20 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Items</div>
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Item</TableHead>
                    <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Qty</TableHead>
                    <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Rate</TableHead>
                    <TableHead className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {order.orderLines?.map((line: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="px-6 py-4 border-r last:border-0 border-border/10 text-sm text-foreground/85">{line.name}</TableCell>
                      <TableCell className="px-6 py-4 border-r last:border-0 border-border/10 font-mono text-sm text-foreground">{line.productQty}</TableCell>
                      <TableCell className="px-6 py-4 border-r last:border-0 border-border/10 font-mono text-sm text-foreground/80">{Number(line.priceUnit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="px-6 py-4 text-right font-mono text-sm text-foreground">
                        {Number(line.priceSubtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {order.salesInvoiceIds?.length > 0 && (
              <Card className="border border-border/40 shadow-none bg-background rounded-none overflow-hidden">
                <div className="px-6 py-4 border-b border-border/20 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Invoices</div>
                <Table>
                  <TableHeader className="border-border/40">
                    <TableRow>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Number</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Status</TableHead>
                      <TableHead className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/30">
                    {order.salesInvoiceIds.map((inv: any) => (
                      <TableRow
                        key={inv._id}
                        className="group transition-colors duration-300 hover:bg-white/[0.015] cursor-pointer"
                        onClick={() => router.push(`/sales/invoices/${inv._id}`)}
                      >
                        <TableCell className="px-6 py-4 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-primary">{inv.number}</TableCell>
                        <TableCell className="px-6 py-4 border-r last:border-0 border-border/10 text-sm text-foreground/80 capitalize">{inv.status}</TableCell>
                        <TableCell className="px-6 py-4 text-right font-mono text-sm text-foreground">
                          ₹{Number(inv.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {order.salesOrderStatus === "draft" && (
                <Button disabled={busy} className="none-xl h-10 px-5 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[11px] uppercase tracking-wider rounded-none cursor-pointer" onClick={() => patch({ salesOrderStatus: "confirmed" })}>
                  Confirm Sales Order
                </Button>
              )}
              {order.salesOrderStatus === "confirmed" && order.shipmentStatus !== "fulfilled" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  className="h-10 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider"
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
                <Button variant="outline" disabled={busy} className="h-10 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={convertToInvoice}>
                  Convert to Invoice
                </Button>
              )}
              {order.salesOrderStatus !== "on_hold" && order.salesOrderStatus !== "void" && order.salesOrderStatus !== "closed" && (
                <Button variant="outline" disabled={busy} className="h-10 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => patch({ salesOrderStatus: "on_hold" })}>
                  Put On Hold
                </Button>
              )}
              {order.salesOrderStatus !== "void" && order.salesOrderStatus !== "closed" && (
                <Button variant="outline" disabled={busy} className="h-10 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => patch({ salesOrderStatus: "void" })}>
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
