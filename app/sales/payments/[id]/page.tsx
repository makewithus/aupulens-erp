"use client";

import { useEffect, useState, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">{payment.paymentNumber}</h1>
                <p className="text-sm text-muted-foreground">
                  {payment.customerId?.header?.displayName || payment.customerId?.header?.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-none border capitalize">{payment.status}</span>
                {payment.status === "paid" && (
                  <Button variant="outline" onClick={handleVoid} disabled={voiding}>
                    {voiding ? "Voiding..." : "Void Payment"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => router.push("/sales/payments")}>
                  Back
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm border rounded-none p-4">
              <div>
                <span className="text-muted-foreground">Payment Date: </span>
                {new Date(payment.paymentDate).toLocaleDateString("en-IN")}
              </div>
              <div>
                <span className="text-muted-foreground">Mode: </span>
                {payment.mode}
              </div>
              <div>
                <span className="text-muted-foreground">Amount Received: </span>₹
                {Number(payment.amountReceived).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <div>
                <span className="text-muted-foreground">Bank Charges: </span>₹
                {Number(payment.bankCharges || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <div>
                <span className="text-muted-foreground">Unused Amount: </span>₹
                {Number(payment.unusedAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <div>
                <span className="text-muted-foreground">Reference#: </span>
                {payment.reference || "—"}
              </div>
              {payment.notes && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Notes: </span>
                  {payment.notes}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-2">Applied To Invoices</h2>
              {payment.allocations?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="text-right">Amount Applied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payment.allocations.map((a: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{a.invoiceId?.number || "—"}</TableCell>
                        <TableCell className="text-right">
                          ₹{Number(a.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">This payment isn&apos;t applied to any invoice.</p>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
