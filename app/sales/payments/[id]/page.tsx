"use client";

import { useEffect, useState, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

const statusColors: Record<string, string> = {
  paid: "text-emerald-500",
  draft: "text-amber-500",
  void: "text-red-500",
};

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/sales/payments/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setPayment(d.data);
        else toast.error(d.message || "Failed to load payment");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleVoid = async () => {
    if (!confirm("Void this payment? This will reverse its effect on any invoices it was applied to.")) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/sales/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to void payment");
      toast.success("Payment voided");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setVoiding(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Payment"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Payments", href: "/sales/payments" }, { label: payment?.paymentNumber || "Payment" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <SalesTabNav />
        {loading || !payment ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tighter text-primary">{payment.paymentNumber}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {payment.customerId?.header?.displayName || payment.customerId?.header?.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[11px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[payment.status] || "text-muted-foreground"}`}>
                  {payment.status}
                </Badge>
                {payment.status === "paid" && (
                  <Button variant="outline" className="h-10 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={handleVoid} disabled={voiding}>
                    {voiding ? "Voiding..." : "Void Payment"}
                  </Button>
                )}
                <Button variant="outline" className="h-10 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => router.push("/sales/payments")}>
                  Back
                </Button>
              </div>
            </div>

            <Card className="border border-border/40 shadow-none bg-background rounded-none p-6">
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Payment Date</p>
                  <p className="font-medium text-foreground mt-1">{new Date(payment.paymentDate).toLocaleDateString("en-IN")}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Mode</p>
                  <p className="font-medium text-foreground mt-1">{payment.mode}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Amount Received</p>
                  <p className="font-mono text-foreground mt-1">₹{Number(payment.amountReceived).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Bank Charges</p>
                  <p className="font-mono text-foreground mt-1">₹{Number(payment.bankCharges || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Unused Amount</p>
                  <p className="font-mono text-foreground mt-1">₹{Number(payment.unusedAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Reference#</p>
                  <p className="font-medium text-foreground mt-1">{payment.reference || "—"}</p>
                </div>
                {payment.notes && (
                  <div className="col-span-2">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Notes</p>
                    <p className="font-medium text-foreground mt-1">{payment.notes}</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="border border-border/40 shadow-none bg-background rounded-none overflow-hidden">
              <div className="px-6 py-4 border-b border-border/20 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Applied To Invoices</div>
              {payment.allocations?.length ? (
                <Table>
                  <TableHeader className="border-border/40">
                    <TableRow>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Invoice #</TableHead>
                      <TableHead className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Amount Applied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/30">
                    {payment.allocations.map((a: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="px-6 py-4 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-primary">{a.invoiceId?.number || "—"}</TableCell>
                        <TableCell className="px-6 py-4 text-right font-mono text-sm text-foreground">
                          ₹{Number(a.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="p-6 text-sm text-muted-foreground">This payment isn&apos;t applied to any invoice.</p>
              )}
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
