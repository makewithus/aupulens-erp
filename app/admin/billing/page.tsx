"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Zap,
  Download,
  RotateCcw,
  XCircle,
  Clock,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PLAN_ADD_ONS, priceWithAddOns } from "@/lib/billing/planPricing";
import { PLAN_SEAT_BANDS, normalizePlanUserCount, type SeatBandPlanKey } from "@/lib/billing/seatBands";

interface SubscriptionDetails {
  tenantId: string;
  planKey: string;
  status: string;
  billingCycle: "monthly" | "yearly";
  currentPrice: number;
  userCount?: number;
  metadata?: Record<string, unknown>;
  currency: string;
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  paidThroughDate: string;
  nextRenewalDate: string;
  trialEndDate?: string;
  scheduledChange?: {
    planKey: string;
    effectiveDate: string;
    requestedAt: string;
    reason?: string;
  };
  cancellation?: {
    requestedAt: string;
    effectiveDate: string;
    reason?: string;
  };
  autoPay?: {
    enabled: boolean;
    status: string;
    paymentMethod?: { type: string; last4?: string; network?: string };
  };
  gracePeriod?: {
    isInGrace: boolean;
    graceEndsAt?: string;
    failedAttemptsCount: number;
    lastFailureReason?: string;
  };
}

interface PlanCatalogItem {
  key: string;
  name: string;
  description?: string;
  note?: string;
  priceMonthly: number;
  priceYearly: number;
  meteredUsers?: boolean;
  availableForPurchase?: boolean;
  includedUsers?: number;
  additionalUserPriceMonthly?: number;
  additionalUserPriceYearly?: number;
  currency: string;
  features: {
    modules: string[];
    maxUsers: number;
    aiCreditsPerMonth: number;
    storageGb: number;
    supportLevel: string;
  };
}

interface InvoiceRow {
  _id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  totalAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  currency: string;
  receiptNumber?: string;
  seller: { name: string; gstin?: string; state: string; address?: string };
  customer: { name: string; gstin?: string; state: string; address?: string };
  lineItems: Array<{ description: string; qty: number; unitPrice: number; total: number }>;
}

interface CreditNoteRow {
  _id: string;
  creditNoteNumber: string;
  invoiceId: string;
  issuedAt: string;
  totalAmount: number;
  currency: string;
  reason: string;
}

export default function CustomerBillingPortal() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [entitlements, setEntitlements] = useState<any>(null);
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [plansLoadError, setPlansLoadError] = useState<string | null>(null);
  const [planUserCounts, setPlanUserCounts] = useState<Record<string, number>>({});
  const [planAddOns, setPlanAddOns] = useState<Record<string, string[]>>({});
  const [selectedPlanUserCount, setSelectedPlanUserCount] = useState(1);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteRow[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<"monthly" | "yearly">("monthly");

  // Upgrade / Review modal
  const [previewPlan, setPreviewPlan] = useState<PlanCatalogItem | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Downgrade / Cancel modals
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState<PlanCatalogItem | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [autoPayBusy, setAutoPayBusy] = useState(false);

  // Invoice viewer modal
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);

  const loadBillingData = async () => {
    setLoading(true);
    const loadJson = async (url: string) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Request failed: ${url}`);
      return response.json();
    };

    const subscriptionTask = loadJson("/api/billing/subscription")
      .then((data) => {
        if (!data.success) return;
        setSubscription(data.data.subscription);
        setEntitlements(data.data.entitlements);
        const currentPlanKey = data.data.subscription?.planKey;
        const currentAddOns = data.data.subscription?.metadata?.selectedAddOns;
        if (currentPlanKey && Array.isArray(currentAddOns)) {
          setPlanAddOns((existing) => ({ ...existing, [currentPlanKey]: currentAddOns.filter((key: unknown): key is string => typeof key === "string") }));
        }
        if (data.data.subscription?.billingCycle) setSelectedCycle(data.data.subscription.billingCycle);
      })
      .catch(() => toast.error("Could not load subscription details."))
      .finally(() => setLoading(false));

    const plansTask = loadJson("/api/billing/plans")
      .then((data) => {
        if (data.success && Array.isArray(data.data) && data.data.length) {
          setPlans(data.data.filter((plan: PlanCatalogItem) => plan.key !== "free"));
          setPlansLoadError(null);
        } else if (data.success) {
          setPlans([]);
          setPlansLoadError("No active subscription plans are configured. Ask your platform administrator to activate plans in Plan Settings.");
        } else {
          setPlansLoadError(data.error || "Could not load the configured plan catalogue.");
        }
      })
      .catch(() => {
        setPlans([]);
        setPlansLoadError("Could not load the configured plan catalogue. Please refresh and try again.");
        toast.error("Could not load the configured plan catalogue.");
      });

    const invoicesTask = loadJson("/api/billing/invoices")
      .then((data) => { if (data.success) setInvoices(data.data); })
      .catch(() => {});
    const creditNotesTask = loadJson("/api/billing/credit-notes")
      .then((data) => { if (data.success) setCreditNotes(data.data); })
      .catch(() => {});

    await Promise.all([subscriptionTask, plansTask, invoicesTask, creditNotesTask]);
  };

  useEffect(() => {
    loadBillingData();
  }, []);

  const handleAutoPay = async (revoke = false) => {
    if (!subscription) return;
    if (!revoke && !window.confirm(`Authorize Razorpay to charge ${subscription.currency} ${subscription.currentPrice.toLocaleString()} on ${new Date(subscription.nextRenewalDate).toLocaleDateString()} and future billing dates?`)) return;
    setAutoPayBusy(true);
    try {
      const res = await fetch("/api/billing/autopay", {
        method: revoke ? "DELETE" : "POST",
        headers: revoke ? undefined : { "Content-Type": "application/json" },
        body: revoke ? undefined : JSON.stringify({ consent: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "AutoPay request failed.");
      if (data.data?.authorizationUrl) window.location.assign(data.data.authorizationUrl);
      else {
        toast.success(revoke ? "AutoPay cancellation was sent to Razorpay." : "AutoPay status updated.");
        await loadBillingData();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AutoPay request failed.");
    } finally {
      setAutoPayBusy(false);
    }
  };

  // Proration preview when customer selects an upgrade plan
  const handleSelectUpgrade = async (plan: PlanCatalogItem, userCount: number, selectedAddOns: string[]) => {
    setPreviewPlan(plan);
    setSelectedPlanUserCount(userCount);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/billing/upgrade/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlanKey: plan.key,
          billingCycle: selectedCycle,
          userCount,
          addOns: selectedAddOns,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPreviewData(data.data);
      } else {
        toast.error(data.error || "Could not calculate proration.");
        setPreviewPlan(null);
      }
    } catch {
      toast.error("Proration calculation failed.");
      setPreviewPlan(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Payment confirmation & verification
  const handleConfirmUpgradePayment = async () => {
    if (!previewPlan) return;
    setProcessingPayment(true);
    try {
      // 1. Initiate upgrade and create Razorpay order
      const initRes = await fetch("/api/billing/upgrade/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlanKey: previewPlan.key,
          billingCycle: selectedCycle,
          userCount: previewData?.userCount ?? selectedPlanUserCount,
          addOns: previewData?.addOns ?? (planAddOns[previewPlan.key] ?? []),
        }),
      });
      const initData = await initRes.json();
      if (!initData.success) {
        throw new Error(initData.error || "Failed to initiate checkout order.");
      }

      const { order, paymentId, keyId } = initData.data;

      // 2. Dynamically load Razorpay standard checkout
      const loadRazorpayScript = () =>
        new Promise<boolean>((resolve) => {
          if (typeof window !== "undefined" && (window as any).Razorpay) return resolve(true);
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });

      const scriptLoaded = await loadRazorpayScript();

      if (scriptLoaded && typeof window !== "undefined" && (window as any).Razorpay && keyId) {
        const options = {
          key: keyId,
          amount: order.amount,
          currency: order.currency,
          name: "Aupulens Technologies",
          description: `Upgrade to ${previewPlan.name}`,
          order_id: order.id,
          handler: async function (response: any) {
            try {
              const verifyRes = await fetch("/api/billing/upgrade/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  paymentId,
                  razorpayOrderId: response.razorpay_order_id || order.id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyData.success) {
                toast.success(`Upgraded to ${previewPlan.name} successfully! Entitlements are now active.`);
                setPreviewPlan(null);
                setPreviewData(null);
                loadBillingData();
              } else {
                toast.error(verifyData.error || "Payment verification failed.");
              }
            } catch {
              toast.error("Payment verification network failure.");
            } finally {
              setProcessingPayment(false);
            }
          },
          modal: {
            ondismiss: function () {
              setProcessingPayment(false);
              toast.info("Checkout was cancelled.");
            },
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
        return;
      }

      toast.error(
        "Razorpay checkout credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured in environment. Test checkout requires valid Razorpay test keys."
      );
    } catch (err: any) {
      toast.error(err.message || "Upgrade checkout failed.");
    } finally {
      setProcessingPayment(false);
    }
  };

  // Scheduled downgrade confirmation
  const handleConfirmDowngrade = async () => {
    if (!downgradeTarget) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/billing/downgrade/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPlanKey: downgradeTarget.key, userCount: planUserCounts[downgradeTarget.key] ?? downgradeTarget.includedUsers ?? downgradeTarget.features.maxUsers, addOns: planAddOns[downgradeTarget.key] ?? [], billingCycle: selectedCycle }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setShowDowngradeModal(false);
        setDowngradeTarget(null);
        loadBillingData();
      } else {
        toast.error(data.error || "Failed to schedule downgrade.");
      }
    } catch {
      toast.error("Downgrade request failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel scheduled downgrade
  const handleCancelScheduledDowngrade = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/billing/downgrade/schedule", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        loadBillingData();
      } else {
        toast.error(data.error || "Failed to cancel scheduled downgrade.");
      }
    } catch {
      toast.error("Cancellation failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Subscription cancellation
  const handleConfirmCancellation = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/billing/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setShowCancelModal(false);
        loadBillingData();
      } else {
        toast.error(data.error || "Cancellation failed.");
      }
    } catch {
      toast.error("Cancellation failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Subscription reactivation
  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/billing/subscription/reactivate", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        loadBillingData();
      } else {
        toast.error(data.error || "Reactivation failed.");
      }
    } catch {
      toast.error("Reactivation failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryPayment = () => {
    const currentPlanItem = plans.find((p) => p.key === subscription?.planKey);
    if (currentPlanItem) {
      const retryAddOns = Array.isArray(subscription?.metadata?.selectedAddOns)
        ? subscription.metadata.selectedAddOns.filter((key): key is string => typeof key === "string")
        : [];
      handleSelectUpgrade(currentPlanItem, subscription?.userCount ?? currentPlanItem.includedUsers ?? currentPlanItem.features.maxUsers, retryAddOns);
    } else {
      toast.info("Please select a plan below to renew your subscription.");
    }
  };

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin"
      pageName="Plan & Billing"
      breadcrumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Billing" }]}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Plan & Billing</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your subscription, compare plans, view invoices, and manage payment methods.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadBillingData} disabled={loading} className="text-xs">
            <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* 1. Grace Period Alert Banner */}
        {subscription?.gracePeriod?.isInGrace && (
          <div className="border border-destructive/30 bg-destructive/10 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-bold text-destructive">Recurring Payment Overdue — 3-Day Grace Period Active</h3>
              <p className="text-xs text-muted-foreground">
                Your last recurring charge failed ({subscription.gracePeriod.lastFailureReason || "Payment declined"}).
                Your features remain active during grace until{" "}
                <span className="font-semibold text-foreground">
                  {new Date(subscription.gracePeriod.graceEndsAt!).toLocaleDateString()}
                </span>
                . Please update your payment method or retry.
              </p>
              <div className="pt-2">
                <Button size="sm" variant="destructive" onClick={handleRetryPayment} className="text-xs h-7">
                  Retry Payment Now
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Scheduled Downgrade Notice */}
        {subscription?.scheduledChange?.planKey && (
          <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                  Scheduled Downgrade to {subscription.scheduledChange.planKey.toUpperCase()}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Your downgrade takes effect on{" "}
                  <span className="font-medium text-foreground">
                    {new Date(subscription.scheduledChange.effectiveDate).toLocaleDateString()}
                  </span>
                  . Your current features and data remain completely preserved until then.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelScheduledDowngrade}
              disabled={actionLoading}
              className="text-xs shrink-0"
            >
              Cancel Downgrade
            </Button>
          </div>
        )}

        {/* 3. Cancellation Notice */}
        {subscription?.status === "cancelled" && subscription.cancellation?.effectiveDate && (
          <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                  Subscription Cancellation Pending
                </h3>
                <p className="text-xs text-muted-foreground">
                  Future recurring renewals are stopped. You retain full access to all paid features through{" "}
                  <span className="font-medium text-foreground">
                    {new Date(subscription.cancellation.effectiveDate).toLocaleDateString()}
                  </span>
                  .
                </p>
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleReactivate}
              disabled={actionLoading}
              className="text-xs shrink-0"
            >
              Reactivate Subscription
            </Button>
          </div>
        )}

        {/* 4. Current Subscription Overview Card */}
        {loading ? (
          <div className="py-12 flex justify-center items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading subscription details…
          </div>
        ) : (
          <Card className="border shadow-xs overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold uppercase">
                        {(subscription?.planKey || entitlements?.planKey || entitlements?.tier || "starter")} Plan
                      </h2>
                      <Badge
                        variant={
                          (subscription?.status || "active") === "active"
                            ? "default"
                            : (subscription?.status || "active") === "past_due"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-xs capitalize"
                      >
                        {subscription?.status || "active"}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-primary border-primary/40 bg-primary/10">
                        Current Active Plan
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {subscription?.currency || "INR"} {(subscription?.currentPrice ?? 999).toLocaleString()} /{" "}
                      {subscription?.billingCycle || selectedCycle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {subscription && subscription.status !== "cancelled" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCancelModal(true)}
                      className="text-xs text-destructive hover:bg-destructive/10"
                    >
                      Cancel Subscription
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <span className="text-xs text-muted-foreground">Current Billing Period</span>
                  <p className="text-sm font-semibold mt-1">
                    {subscription?.currentPeriodStart
                      ? `${new Date(subscription.currentPeriodStart).toLocaleDateString()} — ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                      : "Active Billing Period"}
                  </p>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">Next Renewal Date</span>
                  <p className="text-sm font-semibold mt-1">
                    {subscription?.nextRenewalDate
                      ? new Date(subscription.nextRenewalDate).toLocaleDateString()
                      : "Active (Monthly Renewal)"}
                  </p>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">AutoPay Authorization</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={subscription?.autoPay?.enabled ? "default" : "outline"} className="text-xs">
                      {subscription?.autoPay?.enabled ? "Authorized" : subscription?.autoPay?.status || "Not Configured"}
                    </Badge>
                    {subscription && subscription.status === "active" && (subscription.autoPay?.enabled ? (
                      <Button size="sm" variant="outline" disabled={autoPayBusy} onClick={() => handleAutoPay(true)}>
                        {autoPayBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke"}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={autoPayBusy} onClick={() => handleAutoPay(false)}>
                        {autoPayBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : subscription.autoPay?.status === "pending" ? "Continue setup" : "Set up AutoPay"}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">Paid-Through Date</span>
                  <p className="text-sm font-semibold mt-1">
                    {subscription?.paidThroughDate
                      ? new Date(subscription.paidThroughDate).toLocaleDateString()
                      : "Current Period Active"}
                  </p>
                </div>
              </div>

              {/* Active Plan Entitlements & Included Quotas */}
              <div className="border-t pt-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">
                  Active Plan Entitlements & Included Quotas
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div className="bg-muted/30 p-2.5 rounded-lg border">
                    <span className="text-muted-foreground block text-[11px]">User Limit</span>
                    <strong className="text-sm font-bold text-foreground">
                      {entitlements?.limits?.maxUsers ?? "—"}{entitlements?.limits?.maxUsers != null ? " Users" : ""}
                    </strong>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border">
                    <span className="text-muted-foreground block text-[11px]">Monthly AI Credits</span>
                    <strong className="text-sm font-bold text-foreground">
                      {entitlements?.limits?.aiCreditsPerMonth?.toLocaleString() ?? "1,000"}
                    </strong>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border">
                    <span className="text-muted-foreground block text-[11px]">Storage Capacity</span>
                    <strong className="text-sm font-bold text-foreground">
                      {entitlements?.limits?.storageGb ? `${entitlements.limits.storageGb} GB` : "5 GB"}
                    </strong>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border">
                    <span className="text-muted-foreground block text-[11px]">Active Modules</span>
                    <strong className="text-xs font-semibold text-foreground uppercase truncate block">
                      {entitlements?.modules?.join(", ") ?? "ADMIN, HR, INVENTORY"}
                    </strong>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 5. Plan Comparison & Selection Section */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Subscription Plans</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compare active plans. Purchase-enabled plans can be selected; upgrades take effect immediately with proration, and downgrades take effect on your next renewal date.
              </p>
            </div>

            {/* Monthly / Yearly Toggle */}
            <div className="bg-muted p-1 rounded-lg inline-flex items-center gap-1 self-start sm:self-auto border">
              <button
                type="button"
                onClick={() => setSelectedCycle("monthly")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  selectedCycle === "monthly" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setSelectedCycle("yearly")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 ${
                  selectedCycle === "yearly" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Annual
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {plans
              .filter((p) => p.key !== "free")
              .map((p, index) => {
                const currentKey = (subscription?.planKey || entitlements?.planKey || entitlements?.tier || "starter").toLowerCase();
                const isCurrent = currentKey === p.key.toLowerCase();
                const seatBand = p.key in PLAN_SEAT_BANDS ? PLAN_SEAT_BANDS[p.key as SeatBandPlanKey] : undefined;
                const isFixedStarter = p.key.toLowerCase() === "starter";
                const includedUsers = seatBand?.minimum ?? Math.min(p.features.maxUsers, Math.max(1, p.includedUsers ?? p.features.maxUsers));
                const requestedUsers = isFixedStarter ? (seatBand?.minimum ?? 5) : p.meteredUsers
                  ? Math.min(p.features.maxUsers, Math.max(includedUsers, planUserCounts[p.key] ?? (isCurrent ? subscription?.userCount ?? includedUsers : includedUsers)))
                  : p.features.maxUsers;
                const users = normalizePlanUserCount(p.key, requestedUsers);
                const currentAddOns = Array.isArray(subscription?.metadata?.selectedAddOns) ? subscription.metadata.selectedAddOns as string[] : [];
                const addOns = PLAN_ADD_ONS[p.key] || [];
                const defaultAddOns = p.key === "growth" || p.key === "pro" ? ["ai_assistant"] : [];
                const selectedAddOns = planAddOns[p.key] ?? (isCurrent ? currentAddOns : defaultAddOns);
                const actionLabel = isCurrent ? "CURRENT PLAN" : index === 0 ? "GET STARTED" : index === 1 ? "START SCALING" : "SELECT PLAN";
                return (
                  <BillingPlanCard
                    key={p.key}
                    plan={p}
                    index={index}
                    selectedCycle={selectedCycle}
                    users={users}
                    selectedAddOns={selectedAddOns}
                    currentAddOns={currentAddOns}
                    isCurrent={isCurrent}
                    currentUserCount={subscription?.userCount ?? p.features.maxUsers}
                    onUserCountCommit={(userCount) => setPlanUserCounts((counts) => ({ ...counts, [p.key]: userCount }))}
                    onAddOnChange={(addOnKey, checked) => setPlanAddOns((current) => {
                      const active = current[p.key] ?? (isCurrent ? currentAddOns : defaultAddOns);
                      return { ...current, [p.key]: checked ? [...active.filter((key) => key !== addOnKey), addOnKey] : active.filter((key) => key !== addOnKey) };
                    })}
                    onSelect={(userCount, addOnsSelected) => {
                      const selectedPrice = priceWithAddOns({ ...p, key: p.key }, selectedCycle, userCount, addOnsSelected).price;
                      if (selectedPrice > (subscription?.currentPrice || 0)) handleSelectUpgrade(p, userCount, addOnsSelected);
                      else {
                        setDowngradeTarget(p);
                        setPlanUserCounts((counts) => ({ ...counts, [p.key]: userCount }));
                        setPlanAddOns((current) => ({ ...current, [p.key]: addOnsSelected }));
                        setShowDowngradeModal(true);
                      }
                    }}
                  />
                );
              })}
          </div>
          {plans.length === 0 && (
            <div role="status" className="mt-4 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {plansLoadError || "Loading configured subscription plans…"}
            </div>
          )}
        </div>

        {/* 6. Invoices & Billing History Section */}
        <Card className="border shadow-xs overflow-hidden">
          <CardHeader className="p-4 border-b bg-muted/20">
            <h2 className="text-base font-bold">Billing History & Tax Invoices</h2>
            <p className="text-xs text-muted-foreground">
              Official GST invoices and payment receipts generated for verified subscription transactions.
            </p>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Taxable Value</TableHead>
                  <TableHead className="text-xs">GST Breakdown</TableHead>
                  <TableHead className="text-xs">Total Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-xs">
                      No invoices issued yet. Invoices are generated automatically upon verified payment.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow key={inv._id} className="text-xs">
                      <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(inv.invoiceDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {inv.lineItems?.[0]?.description || "SaaS Subscription"}
                      </TableCell>
                      <TableCell>₹{inv.taxableAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        {inv.igst > 0 ? (
                          <span>IGST: ₹{inv.igst}</span>
                        ) : (
                          <span>CGST: ₹{inv.cgst} + SGST: ₹{inv.sgst}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">₹{inv.totalAmount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="default" className="text-[10px] capitalize">
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`/api/billing/invoices/${inv._id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={`${inv.invoiceNumber}.pdf`}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] gap-1 px-2"
                              title="Download Official PDF"
                            >
                              <Download className="h-3 w-3" /> PDF
                            </Button>
                          </a>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedInvoice(inv)}
                            className="h-7 text-[11px] gap-1 px-2"
                          >
                            <FileText className="h-3 w-3" /> View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {creditNotes.length > 0 && (
          <Card className="border shadow-xs overflow-hidden">
            <CardHeader className="p-4 border-b bg-muted/20">
              <h2 className="text-base font-bold">Refund Credit Notes</h2>
              <p className="text-xs text-muted-foreground">Refund adjustments linked to their original issued invoices.</p>
            </CardHeader>
            <Table>
              <TableHeader><TableRow><TableHead>Credit note</TableHead><TableHead>Original invoice</TableHead><TableHead>Date</TableHead><TableHead>Reason</TableHead><TableHead>Credit</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {creditNotes.map((note) => (
                  <TableRow key={note._id}>
                    <TableCell className="font-mono">{note.creditNoteNumber}</TableCell>
                    <TableCell className="font-mono">{note.invoiceId}</TableCell>
                    <TableCell>{new Date(note.issuedAt).toLocaleDateString()}</TableCell>
                    <TableCell>{note.reason}</TableCell>
                    <TableCell>{note.currency} {note.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right"><a href={`/api/billing/credit-notes/${note._id}/pdf`} download={`${note.creditNoteNumber}.pdf`}><Button variant="outline" size="sm"><Download className="mr-1 h-3 w-3" />PDF</Button></a></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Modal A: Upgrade Review & Proration Breakdown Modal */}
        {previewPlan && previewData && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <Card className="max-w-lg w-full p-6 space-y-5 bg-background shadow-xl border">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-lg font-bold">Review Upgrade & Proration</h3>
                  <p className="text-xs text-muted-foreground">
                    Upgrading from {subscription?.planKey.toUpperCase()} to {previewPlan.name.toUpperCase()}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-semibold capitalize">
                  {selectedCycle}
                </Badge>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-muted/30 p-3 rounded-lg space-y-1.5 border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New Plan Rate:</span>
                    <span className="font-semibold">₹{previewData.targetPrice.toLocaleString()} / {selectedCycle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Days Remaining in Current Period:</span>
                    <span className="font-semibold">{previewData.proration.daysRemaining} of {previewData.proration.totalDaysInCycle} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unused Current Plan Credit:</span>
                    <span className="text-emerald-600 font-semibold">- ₹{previewData.proration.unusedCurrentPlanCredit}</span>
                  </div>
                </div>

                <div className="border-t pt-3 space-y-1.5">
                  <div className="flex justify-between font-medium">
                    <span>Taxable Prorated Value:</span>
                    <span>₹{previewData.proration.proratedAmount}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    {previewData.proration.isInterState ? (
                      <>
                        <span>IGST (18% Inter-State Supply):</span>
                        <span>₹{previewData.proration.igst}</span>
                      </>
                    ) : (
                      <>
                        <span>CGST (9%) + SGST (9%):</span>
                        <span>₹{previewData.proration.totalTax}</span>
                      </>
                    )}
                  </div>
                  <div className="flex justify-between text-base font-bold border-t pt-2 text-foreground">
                    <span>Amount Due Today:</span>
                    <span className="text-primary font-mono">₹{previewData.proration.totalAmount.toLocaleString()}</span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground pt-1">
                  Upon verified payment, your new modules and quota entitlements become active immediately. Next renewal will occur on{" "}
                  <strong>{new Date(previewData.nextRenewalDate).toLocaleDateString()}</strong> at ₹{previewData.targetPrice.toLocaleString()} + GST.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() => setPreviewPlan(null)}
                  disabled={processingPayment}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmUpgradePayment}
                  disabled={processingPayment}
                  className="text-xs gap-1.5"
                >
                  {processingPayment ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying Payment…
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-3.5 w-3.5" /> Pay ₹{previewData.proration.totalAmount.toLocaleString()} & Upgrade
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Modal B: Scheduled Downgrade Confirmation */}
        {showDowngradeModal && downgradeTarget && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-6 space-y-4 bg-background shadow-xl border">
              <h3 className="text-lg font-bold">Schedule Downgrade to {downgradeTarget.name}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Downgrades take effect on your next billing date (
                <strong>{new Date(subscription?.nextRenewalDate || Date.now()).toLocaleDateString()}</strong>).
                Until that date, your existing entitlements, quotas, and all customer data remain completely active and preserved.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDowngradeModal(false);
                    setDowngradeTarget(null);
                  }}
                  disabled={actionLoading}
                  className="text-xs"
                >
                  Keep Current Plan
                </Button>
                <Button
                  onClick={handleConfirmDowngrade}
                  disabled={actionLoading}
                  className="text-xs"
                >
                  {actionLoading ? "Scheduling..." : "Confirm Scheduled Downgrade"}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Modal C: Cancellation Confirmation */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-6 space-y-4 bg-background shadow-xl border">
              <h3 className="text-lg font-bold text-destructive">Cancel Subscription</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cancelling will stop all future automatic renewals. You will continue to have full access to your plan until{" "}
                <strong>{new Date(subscription?.paidThroughDate || Date.now()).toLocaleDateString()}</strong>.
                You can reactivate your subscription at any time prior to that date.
              </p>

              <div>
                <label className="text-xs font-semibold">Reason for cancelling (optional):</label>
                <input
                  type="text"
                  placeholder="e.g. Downsizing, feature needs changed"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="border rounded-md px-3 py-1.5 text-xs w-full mt-1 bg-background"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowCancelModal(false)}
                  disabled={actionLoading}
                  className="text-xs"
                >
                  Keep My Subscription
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmCancellation}
                  disabled={actionLoading}
                  className="text-xs"
                >
                  {actionLoading ? "Cancelling..." : "Confirm Cancellation"}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Modal D: Official Tax Invoice / Receipt Viewer */}
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <Card className="max-w-2xl w-full p-8 space-y-6 bg-background shadow-2xl border max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between border-b pb-4">
                <div>
                  <div className="text-xl font-bold tracking-tight">TAX INVOICE / RECEIPT</div>
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">{selectedInvoice.invoiceNumber}</div>
                </div>
                <div className="text-right text-xs">
                  <Badge variant="outline" className="uppercase font-semibold">{selectedInvoice.status}</Badge>
                  <div className="text-muted-foreground mt-1">Date: {new Date(selectedInvoice.invoiceDate).toLocaleDateString()}</div>
                </div>
              </div>

              {/* Seller & Customer */}
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div className="space-y-1">
                  <span className="font-semibold text-muted-foreground uppercase text-[10px]">Seller Details</span>
                  <div className="font-bold text-foreground">{selectedInvoice.seller.name}</div>
                  <div className="text-muted-foreground">{selectedInvoice.seller.address}</div>
                  <div>GSTIN: <span className="font-mono">{selectedInvoice.seller.gstin || "—"}</span></div>
                  <div>State: {selectedInvoice.seller.state}</div>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-muted-foreground uppercase text-[10px]">Customer Details</span>
                  <div className="font-bold text-foreground">{selectedInvoice.customer.name}</div>
                  <div className="text-muted-foreground">{selectedInvoice.customer.address}</div>
                  <div>GSTIN: <span className="font-mono">{selectedInvoice.customer.gstin || "Not provided"}</span></div>
                  <div>Place of Supply: {selectedInvoice.customer.state}</div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right">Taxable Value</TableHead>
                      <TableHead className="text-xs text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedInvoice.lineItems.map((item, idx) => (
                      <TableRow key={idx} className="text-xs">
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">₹{item.unitPrice.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">₹{item.total.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals & Tax Breakdown */}
              <div className="flex justify-end text-xs">
                <div className="w-64 space-y-1.5 border-t pt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxable Value:</span>
                    <span>₹{selectedInvoice.taxableAmount.toLocaleString()}</span>
                  </div>
                  {selectedInvoice.igst > 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>IGST (18%):</span>
                      <span>₹{selectedInvoice.igst.toLocaleString()}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-muted-foreground">
                        <span>CGST (9%):</span>
                        <span>₹{selectedInvoice.cgst.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>SGST (9%):</span>
                        <span>₹{selectedInvoice.sgst.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm font-bold border-t pt-1.5 text-foreground">
                    <span>Total Paid:</span>
                    <span className="text-primary">₹{selectedInvoice.totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-[11px] text-muted-foreground">Receipt #: {selectedInvoice.receiptNumber}</span>
                <div className="flex gap-2">
                  <a
                    href={`/api/billing/invoices/${selectedInvoice._id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-1"
                  >
                    <Download className="h-3.5 w-3.5" /> Download PDF
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                    className="text-xs gap-1"
                  >
                    Print
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setSelectedInvoice(null)}
                    className="text-xs"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  starter: ["Basic ERP workflows", "Invoicing & expense tracking", "Simple finance dashboard"],
  growth: ["Full accounting ERP", "Reconciliation & approval systems", "Multi-user collaboration & integrations"],
  pro: ["Advanced AI & custom workflows", "Higher volume & deeper integrations", "Dedicated onboarding & support"],
};

/** Keeps range dragging local to one plan card so the full billing page does
 * not rerender for every pointer movement. Price feedback remains immediate. */
function BillingPlanCard({
  plan,
  index,
  selectedCycle,
  users: initialUsers,
  selectedAddOns,
  currentAddOns,
  isCurrent,
  currentUserCount,
  onUserCountCommit,
  onAddOnChange,
  onSelect,
}: {
  plan: PlanCatalogItem;
  index: number;
  selectedCycle: "monthly" | "yearly";
  users: number;
  selectedAddOns: string[];
  currentAddOns: string[];
  isCurrent: boolean;
  currentUserCount: number;
  onUserCountCommit: (users: number) => void;
  onAddOnChange: (key: string, checked: boolean) => void;
  onSelect: (users: number, addOns: string[]) => void;
}) {
  const [users, setUsers] = useState(initialUsers);
  useEffect(() => setUsers(initialUsers), [initialUsers]);

  const seatBand = plan.key in PLAN_SEAT_BANDS ? PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey] : undefined;
  const isFixedStarter = plan.key.toLowerCase() === "starter";
  const minimumUsers = seatBand?.minimum ?? Math.min(plan.features.maxUsers, Math.max(1, plan.includedUsers ?? plan.features.maxUsers));
  const maximumUsers = seatBand?.maximum ?? Math.max(minimumUsers, plan.features.maxUsers);
  const addOns = PLAN_ADD_ONS[plan.key] || [];
  const highlights = PLAN_HIGHLIGHTS[plan.key] || plan.features.modules;
  const price = priceWithAddOns({ ...plan, key: plan.key }, selectedCycle, users, selectedAddOns).price;
  const currencySymbol = plan.currency === "INR" ? "₹" : `${plan.currency} `;
  const sameAddOns = selectedAddOns.length === currentAddOns.length && selectedAddOns.every((key) => currentAddOns.includes(key));
  const matchesCurrentAddOns = isCurrent && sameAddOns;
  const isCurrentSeatConfiguration = matchesCurrentAddOns && (!plan.meteredUsers || users === currentUserCount);
  const actionLabel = isCurrent ? "CURRENT PLAN" : index === 0 ? "GET STARTED" : index === 1 ? "START SCALING" : "SELECT PLAN";
  const isScaleAtMaximum = plan.key.toLowerCase() === "pro" && users >= maximumUsers;

  const commitUserCount = (target: HTMLInputElement) => {
    const nextUsers = Number(target.value);
    setUsers(nextUsers);
    onUserCountCommit(nextUsers);
  };

  return (
    <Card className={`min-h-[620px] rounded-none border bg-[#151515] text-[#f2f2f2] flex flex-col ${index === 1 ? "border-[#555]" : "border-[#252525]"}`}>
      <CardHeader className="p-6 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-[10px] font-normal tracking-wide text-[#8290a0] uppercase">{plan.name}</CardTitle>
          {index === 1 && <span className="border border-[#292929] px-2 py-1 text-[9px] text-[#8290a0] font-mono">MOST POPULAR</span>}
        </div>
        <div className="mt-3 flex items-baseline gap-2 font-mono">
          <span className="text-[36px] leading-none tracking-[-0.06em] text-white">{currencySymbol}{price.toLocaleString("en-IN")}{isScaleAtMaximum ? "+" : ""}</span>
          <span className="text-[11px] text-[#8290a0]">/ {selectedCycle === "yearly" ? "yr" : "mo"}</span>
        </div>
        <p className="mt-2 min-h-4 font-mono text-[10px] text-[#60656b]">* {plan.note || "Price varies by users and selected add-ons"}</p>
        <p className="mt-4 min-h-[42px] font-mono text-[12px] leading-5 text-[#85898e]">{plan.description || "Configured for your business operations."}</p>
      </CardHeader>

      <CardContent className="px-6 pb-6 pt-0 flex flex-1 flex-col font-mono text-[11px]">
        <div className="border-t border-[#292929] pt-4">
          <label className="block text-[#7b8795]">
            <span className="flex items-center justify-between text-[10px] uppercase tracking-wide">
              <span>Users</span><span className="text-white">{isScaleAtMaximum ? "500+ users" : `${users} users`}</span>
            </span>
            <input
              aria-label={`${plan.name} user count`}
              type="range"
              min={isFixedStarter ? 1 : minimumUsers}
              max={maximumUsers}
              step={plan.key.toLowerCase() === "pro" ? 10 : 1}
              value={users}
              disabled={isFixedStarter || !plan.meteredUsers}
              onChange={(event) => setUsers(Number(event.currentTarget.value))}
              onPointerUp={(event) => commitUserCount(event.currentTarget)}
              onKeyUp={(event) => commitUserCount(event.currentTarget)}
              onBlur={(event) => commitUserCount(event.currentTarget)}
              className="mt-4 h-1 w-full cursor-pointer accent-[#dedee2] disabled:cursor-default disabled:opacity-100 [touch-action:pan-y]"
            />
          </label>
        </div>

        <div className="mt-6 border-b border-[#292929] pb-4">
          <p className="mb-2 text-[10px] uppercase text-[#7b8795]">Add-ons</p>
          <div className="space-y-2">
            {addOns.map((addOn) => (
              <label key={addOn.key} className="flex cursor-pointer items-center justify-between gap-3 text-[#85898e]">
                <span>{addOn.label}</span>
                <Switch
                  checked={selectedAddOns.includes(addOn.key)}
                  aria-label={`${plan.name}: ${addOn.label}`}
                  onCheckedChange={(checked) => onAddOnChange(addOn.key, checked)}
                  className="data-[state=checked]:bg-[#dedee2] data-[state=unchecked]:bg-[#292929]"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-5 border-t border-[#292929] mt-6 py-5 text-[#85898e]">
          {highlights.map((highlight) => (
            <div key={highlight} className="flex gap-3 leading-4">
              <span className="text-white">+</span>
              <span>{highlight}</span>
            </div>
          ))}
        </div>

        {!plan.availableForPurchase ? (
          <Button disabled variant="outline" className="h-11 rounded-none border-[#292929] bg-transparent px-4 text-left font-mono text-[10px] text-[#6c7075]" size="sm">NOT AVAILABLE FOR PURCHASE</Button>
        ) : isCurrentSeatConfiguration ? (
          <Button disabled variant="outline" className="h-11 rounded-none border-[#292929] bg-transparent px-4 text-left font-mono text-[10px] text-white" size="sm">CURRENT PLAN</Button>
        ) : (
          <Button
            className={`h-11 justify-between rounded-none px-4 font-mono text-[10px] ${index === 1 ? "bg-[#f1f1f1] text-black hover:bg-white" : "border border-[#292929] bg-transparent text-white hover:bg-[#202020]"}`}
            size="sm"
            variant="default"
            onClick={() => onSelect(users, selectedAddOns)}
          >
            {isCurrent ? "UPDATE USERS" : actionLabel}<ArrowRight className="h-3.5 w-3.5 -rotate-45" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
