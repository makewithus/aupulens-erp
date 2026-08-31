"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";

interface SubscriptionEvent {
  _id: string;
  type: string;
  tier: string;
  amount: number;
  currency: string;
  occurredAt: string;
  meta?: Record<string, any>;
}

const TYPE_LABELS: Record<string, string> = {
  created: "Workspace Created",
  upgraded: "Plan Upgraded",
  downgraded: "Plan Downgraded",
  renewed: "Renewed",
  payment_succeeded: "Payment Succeeded",
  payment_failed: "Payment Failed",
  canceled: "Canceled",
};

export default function BillingHistoryPage() {
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const qs = params.toString();
    fetch(`/api/billing/history${qs ? `?${qs}` : ""}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setEvents(data.data);
        else setError(data.message || "Could not load billing history");
        setLoading(false);
      });
  }, [dateFrom, dateTo]);

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin"
      pageName="Billing History"
      breadcrumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Billing" }]}
    >
      <div className="p-6 max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Billing History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A record of subscription and plan events for this workspace.
          </p>
        </div>

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : (
          <div className="border-2 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                      {dateFrom || dateTo
                        ? "No billing events match this date range."
                        : "No billing events yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((e) => (
                    <TableRow key={e._id}>
                      <TableCell className="font-medium">{TYPE_LABELS[e.type] || e.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-[10px]">{e.tier}</Badge>
                      </TableCell>
                      <TableCell>{e.amount > 0 ? `${e.currency} ${e.amount.toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(e.occurredAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && !error && (
          <p className="text-xs text-muted-foreground">
            No payment gateway is connected yet, so only workspace-creation and plan-change events appear here —
            see SETUP_INTEGRATIONS.md for adding real payment events once Razorpay/Stripe is wired in.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
