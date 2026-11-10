import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ro_billing_parity";

import SaaSSubscription, { SAAS_SUBSCRIPTION_STATUS } from "@/models/billing/SaaSSubscription";
import BillingPayment, { BILLING_PAYMENT_STATUS, BILLING_PAYMENT_TYPE } from "@/models/billing/BillingPayment";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import { SUBSCRIPTION_EVENT_TYPE } from "@/lib/constants/statuses";
import { computeBillingOverviewMetrics } from "@/lib/billing/overviewMetrics";

const start = new Date(Date.UTC(2026, 9, 1));
const end = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));
const inMonth = new Date(Date.UTC(2026, 9, 15));
const outMonth = new Date(Date.UTC(2026, 8, 15));

/** VERBATIM logic of the previous in-memory implementation (the oracle). */
async function legacy() {
  const dateFilter = { createdAt: { $gte: start, $lte: end } };
  const all = await SaaSSubscription.find({}).lean();
  const active = all.filter((s) => s.status === SAAS_SUBSCRIPTION_STATUS.ACTIVE);
  const pastDue = all.filter((s) => s.status === SAAS_SUBSCRIPTION_STATUS.PAST_DUE || s.gracePeriod?.isInGrace);
  const cancelled = all.filter((s) => s.status === SAAS_SUBSCRIPTION_STATUS.CANCELLED);
  const newPaidSubs = await BillingPayment.countDocuments({ ...dateFilter, type: BILLING_PAYMENT_TYPE.NEW, status: BILLING_PAYMENT_STATUS.SUCCESSFUL });
  const successfulUpgrades = await BillingPayment.find({ ...dateFilter, type: BILLING_PAYMENT_TYPE.UPGRADE, status: BILLING_PAYMENT_STATUS.SUCCESSFUL }).lean();
  const failedUpgrades = await BillingPayment.countDocuments({ ...dateFilter, type: BILLING_PAYMENT_TYPE.UPGRADE, status: BILLING_PAYMENT_STATUS.FAILED });
  const planCounts: Record<string, number> = { free: 0, starter: 0, growth: 0, pro: 0, business: 0, enterprise: 0 };
  all.forEach((sub) => { const key = sub.planKey || "starter"; planCounts[key] = (planCounts[key] || 0) + 1; });
  const moves = await SubscriptionEvent.find({ occurredAt: { $gte: start, $lte: end }, type: { $in: [SUBSCRIPTION_EVENT_TYPE.UPGRADED, SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED] } }).lean();
  const payments = await BillingPayment.find({ ...dateFilter, status: { $in: [BILLING_PAYMENT_STATUS.SUCCESSFUL, BILLING_PAYMENT_STATUS.REFUNDED] } }).lean();
  const refunds = await BillingPayment.find({ ...dateFilter, status: BILLING_PAYMENT_STATUS.REFUNDED }).lean();
  const mrr = active.reduce((sum, s) => sum + Math.round(s.billingCycle === "yearly" ? s.currentPrice / 12 : s.currentPrice), 0);
  const failed = await BillingPayment.find({ ...dateFilter, status: BILLING_PAYMENT_STATUS.FAILED }).lean();
  return {
    totalSubscriptions: all.length, activeSubscriptions: active.length, pastDueOrGraceSubscriptions: pastDue.length, cancelledSubscriptions: cancelled.length,
    planCounts, mrr, newPaidSubs, successfulUpgrades: successfulUpgrades.length, failedUpgrades,
    grossCollected: payments.reduce((s, p) => s + (p.amount || 0), 0), refundCount: refunds.length,
    totalRefunds: refunds.reduce((s, p) => s + (p.refund?.amount || p.amount || 0), 0),
    successfulRenewals: await BillingPayment.countDocuments({ ...dateFilter, type: BILLING_PAYMENT_TYPE.RENEWAL, status: BILLING_PAYMENT_STATUS.SUCCESSFUL }),
    failedRenewals: await BillingPayment.countDocuments({ ...dateFilter, type: BILLING_PAYMENT_TYPE.RENEWAL, status: BILLING_PAYMENT_STATUS.FAILED }),
    failedPaymentCount: failed.length, failedPaymentValue: failed.reduce((s, p) => s + (p.amount || 0), 0),
    planMovements: moves.length,
    cancellationsCount: await SubscriptionEvent.countDocuments({ occurredAt: { $gte: start, $lte: end }, type: SUBSCRIPTION_EVENT_TYPE.CANCELED }),
  };
}

let n = 0;
const D = new Date(Date.UTC(2027, 0, 1));
const sub = (o: any) => ({ tenantId: `t${++n}`, planKey: "starter", status: "active", billingCycle: "monthly", currentPrice: 0, userCount: 1, currency: "INR",
  currentPeriodEnd: D, paidThroughDate: D, nextRenewalDate: D, ...o });
const pay = (o: any) => ({ tenantId: `p${++n}`, type: "new", amount: 100, currency: "INR", status: "successful", idempotencyKey: `idem-${++n}`, createdAt: inMonth, ...o });

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Promise.all([SaaSSubscription.init(), BillingPayment.init(), SubscriptionEvent.init()]);
});
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });

describe("G2 — billing overview: aggregation matches the previous in-memory result exactly", () => {
  it("empty database", async () => {
    expect(await computeBillingOverviewMetrics(start, end)).toEqual(await legacy());
  });

  it("rich fixture incl. rounding half-cases, yearly plans, grace periods, zero-amount refunds, out-of-month rows", async () => {
    await SaaSSubscription.insertMany([
      sub({ currentPrice: 2.5 }),                                  // Math.round(2.5)=3 (banker's would give 2)
      sub({ currentPrice: 3.5 }),                                  // 4
      sub({ currentPrice: 30, billingCycle: "yearly" }),           // 2.5 -> 3
      sub({ currentPrice: 90, billingCycle: "yearly", planKey: "pro" }), // 7.5 -> 8
      sub({ currentPrice: 1999.49, planKey: "growth" }),
      sub({ currentPrice: 1999.5, planKey: "business" }),
      sub({ currentPrice: 12345.67, billingCycle: "yearly", planKey: "enterprise" }),
      sub({ status: "past_due", currentPrice: 500, planKey: "pro" }),
      sub({ status: "cancelled", currentPrice: 700 }),
      sub({ status: "trial", currentPrice: 0, gracePeriod: { isInGrace: true } }),
      sub({ status: "active", currentPrice: 400, gracePeriod: { isInGrace: true }, planKey: "free" }),
      sub({ status: "expired", currentPrice: 999 }),
    ]);
    await BillingPayment.insertMany([
      pay({ type: "new", status: "successful", amount: 1000.25 }),
      pay({ type: "new", status: "successful", amount: 500 }),
      pay({ type: "upgrade", status: "successful", amount: 250.5 }),
      pay({ type: "upgrade", status: "failed", amount: 75 }),
      pay({ type: "renewal", status: "successful", amount: 800 }),
      pay({ type: "renewal", status: "failed", amount: 800 }),
      pay({ type: "renewal", status: "failed", amount: 120.1 }),
      pay({ type: "manual", status: "refunded", amount: 300, refund: { amount: 100 } }),
      pay({ type: "upgrade", status: "refunded", amount: 450, refund: { amount: 0 } }),   // refund.amount 0 -> falls back to amount (JS ||)
      pay({ type: "renewal", status: "refunded", amount: 60 }),                           // no refund object
      pay({ type: "downgrade", status: "pending", amount: 9999 }),
      pay({ type: "new", status: "successful", amount: 7777, createdAt: outMonth }),      // out of window
      pay({ type: "renewal", status: "failed", amount: 5555, createdAt: outMonth }),
    ]);
    await SubscriptionEvent.insertMany([
      { tenantId: "t1", type: SUBSCRIPTION_EVENT_TYPE.UPGRADED, tier: "starter", occurredAt: inMonth },
      { tenantId: "t2", type: SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED, tier: "starter", occurredAt: inMonth },
      { tenantId: "t3", type: SUBSCRIPTION_EVENT_TYPE.CANCELED, tier: "starter", occurredAt: inMonth },
      { tenantId: "t4", type: SUBSCRIPTION_EVENT_TYPE.CANCELED, tier: "starter", occurredAt: outMonth },
      { tenantId: "t5", type: SUBSCRIPTION_EVENT_TYPE.UPGRADED, tier: "starter", occurredAt: outMonth },
    ] as any);

    const expected = await legacy();
    const actual = await computeBillingOverviewMetrics(start, end);
    expect(actual).toEqual(expected);
    // sanity: the half-up rounding cases really are exercised
    expect(expected.mrr).toBe(3 + 4 + 3 + 8 + 1999 + 2000 + 1029 + 400); // active subs only
  });

  it("does not load documents into the application: only aggregation/count commands are issued", async () => {
    const find = [SaaSSubscription, BillingPayment, SubscriptionEvent].map((m) => ({ m, orig: m.find }));
    let finds = 0;
    for (const { m } of find) (m as any).find = (...a: any[]) => { finds++; return (find.find((x) => x.m === m)!.orig as any).apply(m, a); };
    try { await computeBillingOverviewMetrics(start, end); } finally { for (const { m, orig } of find) (m as any).find = orig; }
    expect(finds).toBe(0);
  });
});
