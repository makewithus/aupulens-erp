import SaaSSubscription, { SAAS_SUBSCRIPTION_STATUS } from "@/models/billing/SaaSSubscription";
import BillingPayment, { BILLING_PAYMENT_STATUS, BILLING_PAYMENT_TYPE } from "@/models/billing/BillingPayment";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import { SUBSCRIPTION_EVENT_TYPE } from "@/lib/constants/statuses";

/**
 * Platform billing overview numbers, computed with MongoDB aggregation instead of loading every
 * subscription / payment document into the function's memory. Semantics deliberately mirror the
 * previous in-memory implementation exactly:
 *  - per-subscription MRR is rounded with JS Math.round semantics (round half UP). MongoDB's $round is
 *    banker's rounding (2.5 -> 2), so it must NOT be used; floor(x + 0.5) is identical to Math.round.
 *  - `x || fallback` truthiness is reproduced for refund amounts (a refund.amount of 0 falls back to amount).
 *  - missing / empty planKey counts as "starter".
 */
export interface BillingOverviewMetrics {
  totalSubscriptions: number;
  activeSubscriptions: number;
  pastDueOrGraceSubscriptions: number;
  cancelledSubscriptions: number;
  planCounts: Record<string, number>;
  mrr: number;
  newPaidSubs: number;
  successfulUpgrades: number;
  failedUpgrades: number;
  grossCollected: number;
  refundCount: number;
  totalRefunds: number;
  successfulRenewals: number;
  failedRenewals: number;
  failedPaymentCount: number;
  failedPaymentValue: number;
  planMovements: number;
  cancellationsCount: number;
}

const amountExpr = { $ifNull: ["$amount", 0] };
// JS: p.refund?.amount || p.amount || 0
const refundExpr = { $cond: [{ $ne: [{ $ifNull: ["$refund.amount", 0] }, 0] }, "$refund.amount", amountExpr] };
// JS: Math.round(cycle === "yearly" ? price / 12 : price)
const monthlyRoundedExpr = {
  $floor: {
    $add: [
      { $cond: [{ $eq: ["$billingCycle", "yearly"] }, { $divide: [{ $ifNull: ["$currentPrice", 0] }, 12] }, { $ifNull: ["$currentPrice", 0] }] },
      0.5,
    ],
  },
};

export async function computeBillingOverviewMetrics(startDate: Date, endDate: Date): Promise<BillingOverviewMetrics> {
  const S = SAAS_SUBSCRIPTION_STATUS;
  const P = BILLING_PAYMENT_STATUS;
  const T = BILLING_PAYMENT_TYPE;
  const dateFilter = { createdAt: { $gte: startDate, $lte: endDate } };
  const inMonth = { occurredAt: { $gte: startDate, $lte: endDate } };

  const [subTotals, planGroups, paymentGroups, planMovements, cancellationsCount] = await Promise.all([
    SaaSSubscription.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", S.ACTIVE] }, 1, 0] } },
          pastDue: { $sum: { $cond: [{ $or: [{ $eq: ["$status", S.PAST_DUE] }, { $eq: ["$gracePeriod.isInGrace", true] }] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", S.CANCELLED] }, 1, 0] } },
          mrr: { $sum: { $cond: [{ $eq: ["$status", S.ACTIVE] }, monthlyRoundedExpr, 0] } },
        },
      },
    ]),
    SaaSSubscription.aggregate([
      { $group: { _id: { $cond: [{ $in: [{ $ifNull: ["$planKey", ""] }, [""]] }, "starter", "$planKey"] }, n: { $sum: 1 } } },
    ]),
    BillingPayment.aggregate([
      { $match: dateFilter },
      { $group: { _id: { type: "$type", status: "$status" }, n: { $sum: 1 }, amount: { $sum: amountExpr }, refund: { $sum: refundExpr } } },
    ]),
    SubscriptionEvent.countDocuments({ ...inMonth, type: { $in: [SUBSCRIPTION_EVENT_TYPE.UPGRADED, SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED] } }),
    SubscriptionEvent.countDocuments({ ...inMonth, type: SUBSCRIPTION_EVENT_TYPE.CANCELED }),
  ]);

  const planCounts: Record<string, number> = { free: 0, starter: 0, growth: 0, pro: 0, business: 0, enterprise: 0 };
  for (const g of planGroups) planCounts[g._id] = (planCounts[g._id] || 0) + g.n;

  const pay = (type: string | null, status: string[]) =>
    paymentGroups.filter((g: any) => (type === null || g._id.type === type) && status.includes(g._id.status));
  const count = (type: string | null, status: string[]) => pay(type, status).reduce((a: number, g: any) => a + g.n, 0);
  const sum = (field: "amount" | "refund", type: string | null, status: string[]) => pay(type, status).reduce((a: number, g: any) => a + g[field], 0);

  const t = subTotals[0] ?? { total: 0, active: 0, pastDue: 0, cancelled: 0, mrr: 0 };
  return {
    totalSubscriptions: t.total,
    activeSubscriptions: t.active,
    pastDueOrGraceSubscriptions: t.pastDue,
    cancelledSubscriptions: t.cancelled,
    planCounts,
    mrr: t.mrr,
    newPaidSubs: count(T.NEW, [P.SUCCESSFUL]),
    successfulUpgrades: count(T.UPGRADE, [P.SUCCESSFUL]),
    failedUpgrades: count(T.UPGRADE, [P.FAILED]),
    grossCollected: sum("amount", null, [P.SUCCESSFUL, P.REFUNDED]),
    refundCount: count(null, [P.REFUNDED]),
    totalRefunds: sum("refund", null, [P.REFUNDED]),
    successfulRenewals: count(T.RENEWAL, [P.SUCCESSFUL]),
    failedRenewals: count(T.RENEWAL, [P.FAILED]),
    failedPaymentCount: count(null, [P.FAILED]),
    failedPaymentValue: sum("amount", null, [P.FAILED]),
    planMovements,
    cancellationsCount,
  };
}
