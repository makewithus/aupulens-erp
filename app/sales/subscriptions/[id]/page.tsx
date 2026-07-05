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
    case "active":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800";
    case "trial":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800";
    case "dunning":
    case "unpaid":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800";
    case "cancelled":
    case "expired":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:border-gray-700";
  }
}

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
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : !sub ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Subscription not found</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">{sub.number}</h1>
                <p className="text-sm text-muted-foreground">
                  {sub.customerId?.header?.displayName || sub.customerId?.header?.name}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-none border capitalize ${statusColor(sub.status)}`}>
                {sub.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 border rounded-none p-4 text-sm">
              <div>
                <p className="text-muted-foreground">Plan Name</p>
                <p className="font-medium">{sub.profileName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Amount</p>
                <p className="font-medium">₹{Number(sub.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Billing Frequency</p>
                <p className="font-medium capitalize">{sub.billingFrequency?.replace("_", "-")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Next Billing On</p>
                <p className="font-medium">{sub.nextBillingOn ? new Date(sub.nextBillingOn).toLocaleDateString("en-IN") : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Billed On</p>
                <p className="font-medium">{sub.lastBilledOn ? new Date(sub.lastBilledOn).toLocaleDateString("en-IN") : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Auto Renew</p>
                <p className="font-medium">{sub.autoRenew ? "Yes" : "No"}</p>
              </div>
            </div>

            <div className="border rounded-none">
              <div className="p-3 border-b bg-muted/30 font-semibold text-sm">Generated Invoices</div>
              {sub.generatedInvoiceIds?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sub.generatedInvoiceIds.map((inv: any) => (
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
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  No invoices generated yet — the first invoice is raised on the subscription's next billing date.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              {sub.status !== "cancelled" && (
                <Button variant="outline" disabled={busy} onClick={() => patch({ status: "cancelled" })}>
                  Cancel Subscription
                </Button>
              )}
              {sub.status === "active" && (
                <Button variant="outline" disabled={busy} onClick={() => patch({ autoRenew: !sub.autoRenew })}>
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
