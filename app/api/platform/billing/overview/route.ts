import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { computeBillingOverviewMetrics } from "@/lib/billing/overviewMetrics";
import { verifyGlobalAdmin } from "@/lib/billing/adminAuth";

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyGlobalAdmin(req);
    if (!authResult.isAuthorized) {
      return NextResponse.json(
        { success: false, error: authResult.message },
        { status: authResult.errorStatus || 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month"); // e.g. "2026-10"
    const now = new Date();

    let startDate: Date;
    let endDate: Date;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    } else {
      startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0));
      endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
    }

    const dateFilter = { createdAt: { $gte: startDate, $lte: endDate } };

    // All figures come from MongoDB aggregation (lib/billing/overviewMetrics.ts) — no collection is loaded into memory.
    const m = await computeBillingOverviewMetrics(startDate, endDate);
    const newPaidSubs = m.newPaidSubs;
    const totalUpgradeAttempts = m.successfulUpgrades + m.failedUpgrades;
    const upgradeConversionRate =
      totalUpgradeAttempts > 0 ? Math.round((m.successfulUpgrades / totalUpgradeAttempts) * 100 * 10) / 10 : 100;
    const planCounts = m.planCounts;
    const grossCollected = m.grossCollected;
    const totalRefunds = m.totalRefunds;
    const netCollections = Math.max(0, grossCollected - totalRefunds);
    const mrr = m.mrr;
    const arr = mrr * 12;
    const successfulRenewals = m.successfulRenewals;
    const totalRenewalAttempts = m.successfulRenewals + m.failedRenewals;
    const renewalSuccessRate =
      totalRenewalAttempts > 0 ? Math.round((successfulRenewals / totalRenewalAttempts) * 100 * 10) / 10 : 100;
    const failedPaymentCount = m.failedPaymentCount;
    const failedPaymentValue = m.failedPaymentValue;
    const overdueCount = m.pastDueOrGraceSubscriptions;
    const cancellationsCount = m.cancellationsCount;
    const activeAtStart = Math.max(1, m.activeSubscriptions + cancellationsCount);
    const subscriptionChurnRate = Math.round((cancellationsCount / activeAtStart) * 100 * 10) / 10;
    const revenueChurnRate =
      mrr > 0 ? Math.round(((cancellationsCount * (mrr / activeAtStart)) / mrr) * 100 * 10) / 10 : 0;

    // Assemble 16 KPI cards
    const kpiCards = [
      { id: "new_paid_subs", title: "New Paid Subscriptions", value: newPaidSubs, subtitle: "This month" },
      { id: "successful_upgrades", title: "Successful Upgrades", value: m.successfulUpgrades, subtitle: "Prorated upgrades verified" },
      { id: "upgrade_conversion_rate", title: "Upgrade Conversion Rate", value: `${upgradeConversionRate}%`, subtitle: `${m.successfulUpgrades}/${totalUpgradeAttempts} attempts` },
      { id: "plan_subscribers", title: "Total Subscribers", value: m.totalSubscriptions, subtitle: `${m.activeSubscriptions} active` },
      { id: "plan_movements", title: "Plan Movements", value: m.planMovements, subtitle: "Tier & plan changes" },
      { id: "gross_collections", title: "Gross Collections", value: `₹${grossCollected.toLocaleString("en-IN")}`, subtitle: "Total charged" },
      { id: "refunds", title: "Refunds Issued", value: `₹${totalRefunds.toLocaleString("en-IN")}`, subtitle: `${m.refundCount} refunds` },
      { id: "net_collections", title: "Net Collections", value: `₹${netCollections.toLocaleString("en-IN")}`, subtitle: "Gross minus refunds" },
      { id: "mrr", title: "Monthly Recurring Revenue (MRR)", value: `₹${mrr.toLocaleString("en-IN")}`, subtitle: "Active normalized run-rate" },
      { id: "arr", title: "Annual Run Rate (ARR)", value: `₹${arr.toLocaleString("en-IN")}`, subtitle: "MRR × 12" },
      { id: "renewal_success_rate", title: "Renewal Success Rate", value: `${renewalSuccessRate}%`, subtitle: `${successfulRenewals}/${totalRenewalAttempts} recurring charges` },
      { id: "failed_payments", title: "Failed Payments", value: failedPaymentCount, subtitle: `Value: ₹${failedPaymentValue.toLocaleString("en-IN")}` },
      { id: "overdue_subs", title: "Overdue / Grace Period", value: overdueCount, subtitle: "3-day recovery active" },
      { id: "cancellations", title: "Cancellations", value: cancellationsCount, subtitle: "Cancelled this month" },
      { id: "sub_churn", title: "Subscriber Churn Rate", value: `${subscriptionChurnRate}%`, subtitle: "Cancellations / active base" },
      { id: "rev_churn", title: "Revenue Churn Rate", value: `${revenueChurnRate}%`, subtitle: "Lost MRR fraction" },
    ];

    return NextResponse.json({
      success: true,
      data: {
        reportingPeriod: {
          startDate,
          endDate,
          month: monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        },
        kpis: kpiCards,
        planDistribution: planCounts,
        recentUpgradesCount: m.successfulUpgrades,
      },
    });
  } catch (error: any) {
    console.error("Platform billing overview error:", error);
    return NextResponse.json(
      { success: false, error: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}
