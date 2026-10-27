import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import SaaSSubscription, { SAAS_SUBSCRIPTION_STATUS } from "@/models/billing/SaaSSubscription";
import BillingPayment, {
  BILLING_PAYMENT_STATUS,
  BILLING_PAYMENT_TYPE,
} from "@/models/billing/BillingPayment";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import { verifyGlobalAdmin } from "@/lib/billing/adminAuth";
import { SUBSCRIPTION_EVENT_TYPE } from "@/lib/constants/statuses";

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

    // 1. All subscriptions
    const allSubscriptions = await SaaSSubscription.find({}).lean();
    const activeSubs = allSubscriptions.filter((s) => s.status === SAAS_SUBSCRIPTION_STATUS.ACTIVE);
    const pastDueSubs = allSubscriptions.filter(
      (s) => s.status === SAAS_SUBSCRIPTION_STATUS.PAST_DUE || s.gracePeriod?.isInGrace
    );
    const cancelledSubs = allSubscriptions.filter(
      (s) => s.status === SAAS_SUBSCRIPTION_STATUS.CANCELLED
    );

    // 2. New paid subscriptions in month
    const newPaidSubs = await BillingPayment.countDocuments({
      ...dateFilter,
      type: BILLING_PAYMENT_TYPE.NEW,
      status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
    });

    // 3. Successful upgrades in month
    const successfulUpgrades = await BillingPayment.find({
      ...dateFilter,
      type: BILLING_PAYMENT_TYPE.UPGRADE,
      status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
    }).lean();

    const failedUpgrades = await BillingPayment.countDocuments({
      ...dateFilter,
      type: BILLING_PAYMENT_TYPE.UPGRADE,
      status: BILLING_PAYMENT_STATUS.FAILED,
    });

    const totalUpgradeAttempts = successfulUpgrades.length + failedUpgrades;
    const upgradeConversionRate =
      totalUpgradeAttempts > 0
        ? Math.round((successfulUpgrades.length / totalUpgradeAttempts) * 100 * 10) / 10
        : 100;

    // 4. Plan-wise subscriber counts
    const planCounts: Record<string, number> = {
      free: 0,
      starter: 0,
      growth: 0,
      pro: 0,
      business: 0,
      enterprise: 0,
    };
    allSubscriptions.forEach((sub) => {
      const key = sub.planKey || "starter";
      planCounts[key] = (planCounts[key] || 0) + 1;
    });

    // 5. Plan movements in month (from SubscriptionEvent)
    const planMovementEvents = await SubscriptionEvent.find({
      occurredAt: { $gte: startDate, $lte: endDate },
      type: { $in: [SUBSCRIPTION_EVENT_TYPE.UPGRADED, SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED] },
    }).lean();

    // 6. Payments collected in month
    const paymentsInMonth = await BillingPayment.find({
      ...dateFilter,
      status: { $in: [BILLING_PAYMENT_STATUS.SUCCESSFUL, BILLING_PAYMENT_STATUS.REFUNDED] },
    }).lean();

    const grossCollected = paymentsInMonth.reduce((sum, p) => sum + (p.amount || 0), 0);

    // 7. Refunds in month
    const refundsInMonth = await BillingPayment.find({
      ...dateFilter,
      status: BILLING_PAYMENT_STATUS.REFUNDED,
    }).lean();

    const totalRefunds = refundsInMonth.reduce((sum, p) => sum + (p.refund?.amount || p.amount || 0), 0);
    const netCollections = Math.max(0, grossCollected - totalRefunds);

    // 8. MRR & ARR from active subscriptions
    // Normalized monthly price: if billingCycle is yearly, priceYearly / 12, else priceMonthly
    const mrr = activeSubs.reduce((sum, s) => {
      const monthlyAmount = s.billingCycle === "yearly" ? s.currentPrice / 12 : s.currentPrice;
      return sum + Math.round(monthlyAmount);
    }, 0);
    const arr = mrr * 12;

    // 9. Renewal success rate
    const successfulRenewals = await BillingPayment.countDocuments({
      ...dateFilter,
      type: BILLING_PAYMENT_TYPE.RENEWAL,
      status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
    });
    const failedRenewals = await BillingPayment.countDocuments({
      ...dateFilter,
      type: BILLING_PAYMENT_TYPE.RENEWAL,
      status: BILLING_PAYMENT_STATUS.FAILED,
    });
    const totalRenewalAttempts = successfulRenewals + failedRenewals;
    const renewalSuccessRate =
      totalRenewalAttempts > 0
        ? Math.round((successfulRenewals / totalRenewalAttempts) * 100 * 10) / 10
        : 100;

    // 10. Failed payments count & value
    const failedPayments = await BillingPayment.find({
      ...dateFilter,
      status: BILLING_PAYMENT_STATUS.FAILED,
    }).lean();
    const failedPaymentCount = failedPayments.length;
    const failedPaymentValue = failedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // 11. Overdue subscriptions
    const overdueCount = pastDueSubs.length;

    // 12. Cancellations in month
    const cancellationsCount = await SubscriptionEvent.countDocuments({
      occurredAt: { $gte: startDate, $lte: endDate },
      type: SUBSCRIPTION_EVENT_TYPE.CANCELED,
    });

    // 13. Churn rates
    const activeAtStart = Math.max(1, activeSubs.length + cancellationsCount);
    const subscriptionChurnRate =
      Math.round((cancellationsCount / activeAtStart) * 100 * 10) / 10;
    const revenueChurnRate =
      mrr > 0 ? Math.round(((cancellationsCount * (mrr / activeAtStart)) / mrr) * 100 * 10) / 10 : 0;

    // Assemble 16 KPI cards
    const kpiCards = [
      { id: "new_paid_subs", title: "New Paid Subscriptions", value: newPaidSubs, subtitle: "This month" },
      { id: "successful_upgrades", title: "Successful Upgrades", value: successfulUpgrades.length, subtitle: "Prorated upgrades verified" },
      { id: "upgrade_conversion_rate", title: "Upgrade Conversion Rate", value: `${upgradeConversionRate}%`, subtitle: `${successfulUpgrades.length}/${totalUpgradeAttempts} attempts` },
      { id: "plan_subscribers", title: "Total Subscribers", value: allSubscriptions.length, subtitle: `${activeSubs.length} active` },
      { id: "plan_movements", title: "Plan Movements", value: planMovementEvents.length, subtitle: "Tier & plan changes" },
      { id: "gross_collections", title: "Gross Collections", value: `₹${grossCollected.toLocaleString("en-IN")}`, subtitle: "Total charged" },
      { id: "refunds", title: "Refunds Issued", value: `₹${totalRefunds.toLocaleString("en-IN")}`, subtitle: `${refundsInMonth.length} refunds` },
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
        recentUpgradesCount: successfulUpgrades.length,
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
