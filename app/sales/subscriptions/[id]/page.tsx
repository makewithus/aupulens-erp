"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

const statusColors: Record<string, string> = {
  active: "text-emerald-500",
  trial: "text-blue-500",
  dunning: "text-amber-500",
  unpaid: "text-amber-500",
  cancelled: "text-red-500",
  expired: "text-red-500",
};

export default function SubscriptionDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/subscriptions/${id}`);
      const data = await res.json();
      if (data.success) setSub(data.data);
      else toast.error(data.message || "Failed to load subscription");
    } catch {
      toast.error("Failed to load subscription");
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
      const res = await fetch(`/api/sales/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Update failed");
      setSub(data.data);
      toast.success("Subscription updated");
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
      pageName="Subscription"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Subscriptions", href: "/sales/subscriptions" },
        { label: sub?.number || "Detail" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !sub ? (
          <div className="py-16 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Subscription not found</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tighter text-primary">{sub.number}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {sub.customerId?.header?.displayName || sub.customerId?.header?.name}
                </p>
              </div>
              <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[11px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[sub.status] || "text-muted-foreground"}`}>
                {sub.status}
              </Badge>
            </div>

            <Card className="border border-border/40 shadow-none bg-background rounded-none p-6">
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Plan Name</p>
                  <p className="font-medium text-foreground mt-1">{sub.profileName}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Amount</p>
                  <p className="font-mono text-foreground mt-1">₹{Number(sub.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Billing Frequency</p>
                  <p className="font-medium text-foreground mt-1 capitalize">{sub.billingFrequency?.replace("_", "-")}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Next Billing On</p>
                  <p className="font-medium text-foreground mt-1">{sub.nextBillingOn ? new Date(sub.nextBillingOn).toLocaleDateString("en-IN") : "—"}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Last Billed On</p>
                  <p className="font-medium text-foreground mt-1">{sub.lastBilledOn ? new Date(sub.lastBilledOn).toLocaleDateString("en-IN") : "—"}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Auto Renew</p>
                  <p className="font-medium text-foreground mt-1">{sub.autoRenew ? "Yes" : "No"}</p>
                </div>
              </div>
            </Card>

            <Card className="border border-border/40 shadow-none bg-background rounded-none overflow-hidden">
              <div className="px-6 py-4 border-b border-border/20 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Generated Invoices</div>
              {sub.generatedInvoiceIds?.length ? (
                <Table>
                  <TableHeader className="border-border/40">
                    <TableRow>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Number</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Status</TableHead>
                      <TableHead className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/30">
                    {sub.generatedInvoiceIds.map((inv: any) => (
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
              ) : (
                <p className="p-6 text-sm text-muted-foreground">
                  No invoices generated yet — the first invoice is raised on the subscription&apos;s next billing date.
                </p>
              )}
            </Card>

            <div className="flex items-center gap-2">
              {sub.status !== "cancelled" && (
                <Button variant="outline" disabled={busy} className="h-10 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => patch({ status: "cancelled" })}>
                  Cancel Subscription
                </Button>
              )}
              {sub.status === "active" && (
                <Button variant="outline" disabled={busy} className="h-10 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => patch({ autoRenew: !sub.autoRenew })}>
                  {sub.autoRenew ? "Mark as Non-Renewing" : "Resume Auto-Renew"}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
