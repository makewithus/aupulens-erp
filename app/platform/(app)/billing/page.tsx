"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  Search,
  Filter,
  CreditCard,
  TrendingUp,
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  DollarSign,
  Users,
} from "lucide-react";
import { toast } from "sonner";

interface KpiCard {
  id: string;
  title: string;
  value: string | number;
  subtitle: string;
}

interface UpgradeRow {
  id: string;
  tenantId: string;
  tenantName: string;
  previousPlan: string;
  newPlan: string;
  upgradeTimestamp: string;
  billingFrequency: string;
  upgradeStatus: string;
  amountCharged: number;
  proration: {
    taxableAmount: number;
    daysRemaining: number;
    totalDaysInCycle: number;
    prorationFraction: number;
  };
  tax: {
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    isInterState: boolean;
  };
  currency: string;
  paymentStatus: string;
  paymentReference: string;
  relatedInvoice: string;
  nextRenewalDate: string | null;
}

interface SubscriptionRow {
  _id: string;
  tenantId: string;
  organizationName: string;
  planKey: string;
  status: string;
  billingCycle: string;
  currentPrice: number;
  currency: string;
  currentPeriodEnd: string;
  nextRenewalDate: string;
  autoPay?: { enabled: boolean; status: string };
  gracePeriod?: { isInGrace: boolean; graceEndsAt?: string };
}

export default function PlatformBillingDashboard() {
  const [activeTab, setActiveTab] = useState<"kpis" | "upgrades" | "subscriptions">("kpis");
  const [month, setMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiCard[]>([]);
  const [planDistribution, setPlanDistribution] = useState<Record<string, number>>({});
  const [upgrades, setUpgrades] = useState<UpgradeRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [subSearch, setSubSearch] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("all");

  // Refund modal state
  const [refundPaymentId, setRefundPaymentId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundRequestId, setRefundRequestId] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ovRes, upgRes, subsRes] = await Promise.all([
        fetch(`/api/platform/billing/overview?month=${month}`),
        fetch(`/api/platform/billing/upgrades?month=${month}`),
        fetch(`/api/platform/billing/subscriptions`),
      ]);

      const [ovData, upgData, subsData] = await Promise.all([
        ovRes.json(),
        upgRes.json(),
        subsRes.json(),
      ]);

      if (ovData.success) {
        setKpis(ovData.data.kpis);
        setPlanDistribution(ovData.data.planDistribution || {});
      }
      if (upgData.success) {
        setUpgrades(upgData.data);
      }
      if (subsData.success) {
        setSubscriptions(subsData.data);
      }
    } catch (err: any) {
      toast.error("Failed to load billing metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [month]);

  const handleExport = (type: "upgrades" | "transactions") => {
    window.open(`/api/platform/billing/export?type=${type}&month=${month}`, "_blank");
  };

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundPaymentId || !refundReason) {
      toast.error("Payment ID and reason are required.");
      return;
    }

    setRefundLoading(true);
    try {
      const res = await fetch("/api/platform/billing/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": refundRequestId },
        body: JSON.stringify({
          paymentId: refundPaymentId,
          amount: refundAmount ? Number(refundAmount) : undefined,
          reason: refundReason,
          idempotencyKey: refundRequestId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setShowRefundModal(false);
        setRefundPaymentId("");
        setRefundAmount("");
        setRefundReason("");
        setRefundRequestId("");
        loadData();
      } else {
        toast.error(data.error || "Failed to process refund.");
      }
    } catch {
      toast.error("Refund request failed.");
    } finally {
      setRefundLoading(false);
    }
  };

  const filteredSubs = subscriptions.filter((s) => {
    const matchesSearch =
      !subSearch ||
      s.tenantId.toLowerCase().includes(subSearch.toLowerCase()) ||
      (s.organizationName && s.organizationName.toLowerCase().includes(subSearch.toLowerCase()));
    const matchesStatus = subStatusFilter === "all" || s.status === subStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-full">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Subscriptions & Revenue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global Admin authoritative subscription metrics, verified upgrades, payments, and billing audit trail.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Month:</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-xs bg-background focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("upgrades")}
            className="text-xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> Export Upgrades
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("transactions")}
            className="text-xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> Export All Txns
          </Button>

          <Button
            size="sm"
            onClick={loadData}
            variant="ghost"
            className="h-8 w-8 p-0"
            title="Refresh"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b">
        <button
          onClick={() => setActiveTab("kpis")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "kpis"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Executive KPIs & Revenue
        </button>
        <button
          onClick={() => setActiveTab("upgrades")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "upgrades"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Monthly Upgrades ({upgrades.length})
        </button>
        <button
          onClick={() => setActiveTab("subscriptions")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "subscriptions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Tenant Subscriptions ({subscriptions.length})
        </button>
      </div>

      {/* Tab 1: Executive KPI Cards */}
      {activeTab === "kpis" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <Card key={kpi.id} className="shadow-xs hover:border-primary/40 transition-colors">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {kpi.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-bold tracking-tight text-foreground">{kpi.value}</div>
                  <p className="text-[11px] text-muted-foreground mt-1">{kpi.subtitle}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Plan Distribution Breakdown */}
          <Card className="p-6">
            <h3 className="text-base font-semibold mb-4">Subscriber Plan Distribution</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(planDistribution).map(([plan, count]) => (
                <div key={plan} className="border rounded-lg p-3 text-center bg-muted/20">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">{plan}</div>
                  <div className="text-xl font-bold mt-1">{count}</div>
                  <div className="text-[10px] text-muted-foreground">subscribers</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Monthly Upgrade Tracking Table */}
      {activeTab === "upgrades" && (
        <Card className="overflow-hidden border shadow-xs">
          <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/10">
            <div>
              <h2 className="text-base font-semibold">Verified Upgrade Records</h2>
              <p className="text-xs text-muted-foreground">
                Tracked prorated upgrades charged during {month}. Entitlements activate only after successful payment verification.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("upgrades")}
              className="text-xs self-start sm:self-auto"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Download CSV
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs">Transition</TableHead>
                  <TableHead className="text-xs">Upgrade Date</TableHead>
                  <TableHead className="text-xs">Cycle</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Proration Details</TableHead>
                  <TableHead className="text-xs">Tax (GST)</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upgrades.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground text-sm">
                      No upgrades recorded for month {month}.
                    </TableCell>
                  </TableRow>
                ) : (
                  upgrades.map((u) => (
                    <TableRow key={u.id} className="text-xs">
                      <TableCell className="font-medium">
                        <div>{u.tenantName}</div>
                        <span className="text-[10px] text-muted-foreground font-mono">{u.tenantId}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 font-semibold uppercase text-[11px]">
                          <Badge variant="outline" className="text-[10px]">{u.previousPlan}</Badge>
                          <span>→</span>
                          <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">{u.newPlan}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(u.upgradeTimestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="capitalize">{u.billingFrequency}</TableCell>
                      <TableCell className="font-semibold">
                        {u.currency} {u.amountCharged.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-[11px]">
                        <div>Taxable: {u.currency} {u.proration.taxableAmount}</div>
                        <div className="text-muted-foreground text-[10px]">
                          {u.proration.daysRemaining}/{u.proration.totalDaysInCycle} days rem
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px]">
                        {u.tax.isInterState ? (
                          <span>IGST: {u.currency} {u.tax.igst}</span>
                        ) : (
                          <span>CGST+SGST: {u.currency} {u.tax.totalTax}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.paymentStatus === "successful" ? "default" : "destructive"}
                          className="capitalize text-[10px]"
                        >
                          {u.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {u.paymentReference}
                      </TableCell>
                      <TableCell className="font-mono text-[10px]">
                        <div className="flex items-center gap-2">
                          <span>{u.relatedInvoice}</span>
                          {u.paymentStatus === "successful" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setRefundPaymentId(u.paymentReference || u.id);
                                setRefundRequestId(crypto.randomUUID());
                                setShowRefundModal(true);
                              }}
                            >
                              Refund
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Tab 3: Tenant Subscriptions Table */}
      {activeTab === "subscriptions" && (
        <Card className="overflow-hidden border shadow-xs">
          <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/10">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by tenant name or subdomain..."
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Status:</span>
              <select
                value={subStatusFilter}
                onChange={(e) => setSubStatusFilter(e.target.value)}
                className="border rounded-md px-2.5 py-1 text-xs bg-background"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="past_due">Past Due (Grace)</option>
                <option value="cancelled">Cancelled</option>
                <option value="suspended">Suspended</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => { setRefundRequestId(crypto.randomUUID()); setShowRefundModal(true); }}
                className="text-xs"
              >
                Issue Refund
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Organisation</TableHead>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Cycle</TableHead>
                  <TableHead className="text-xs">Price</TableHead>
                  <TableHead className="text-xs">Next Renewal</TableHead>
                  <TableHead className="text-xs">AutoPay</TableHead>
                  <TableHead className="text-xs">Grace Period</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                      No tenant subscriptions match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubs.map((s) => (
                    <TableRow key={s._id} className="text-xs">
                      <TableCell className="font-medium">
                        <div>{s.organizationName}</div>
                        <span className="text-[10px] text-muted-foreground font-mono">{s.tenantId}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase font-semibold text-[10px]">
                          {s.planKey}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.status === "active"
                              ? "default"
                              : s.status === "past_due"
                              ? "destructive"
                              : "secondary"
                          }
                          className="capitalize text-[10px]"
                        >
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{s.billingCycle}</TableCell>
                      <TableCell className="font-semibold">
                        {s.currency} {s.currentPrice.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.nextRenewalDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.autoPay?.enabled ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {s.autoPay?.enabled ? "Enabled" : "Manual"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.gracePeriod?.isInGrace ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Grace Active (until {new Date(s.gracePeriod.graceEndsAt!).toLocaleDateString()})
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRefundPaymentId(s._id);
                            setRefundRequestId(crypto.randomUUID());
                            setShowRefundModal(true);
                          }}
                          className="h-7 px-2 text-[11px]"
                        >
                          Refund
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-4 bg-background">
            <h2 className="text-lg font-bold">Issue Global Admin Refund</h2>
            <p className="text-xs text-muted-foreground">
              Traceable adjustment will update the payment record, add a negative revenue event, and annotate the tax invoice.
            </p>

            <form onSubmit={handleProcessRefund} className="space-y-3">
              <div>
                <label className="text-xs font-semibold">Payment / Record ID</label>
                <Input
                  required
                  placeholder="e.g. 60d5ec49f1b2c8b1f8e4e1a1"
                  value={refundPaymentId}
                  onChange={(e) => setRefundPaymentId(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Refund Amount (Optional, blank = full)</label>
                <Input
                  type="number"
                  placeholder="Full amount if left blank"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Reason for Refund</label>
                <Input
                  required
                  placeholder="e.g. Customer billing adjustment, requested plan downgrade credit"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRefundModal(false)}
                  disabled={refundLoading}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={refundLoading} className="text-xs">
                  {refundLoading ? "Processing..." : "Confirm Refund"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
