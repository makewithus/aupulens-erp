import connectDB from "@/lib/db";
import SaaSSubscription, { SAAS_SUBSCRIPTION_STATUS } from "@/models/billing/SaaSSubscription";
import BillingPayment, {
  BILLING_PAYMENT_STATUS,
  BILLING_PAYMENT_TYPE,
} from "@/models/billing/BillingPayment";
import Organization from "@/models/admin/Organization";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import {
  ORGANIZATION_TIER,
  PLAN_KEY,
  PlanKeyType,
  SUBSCRIPTION_EVENT_TYPE,
  type OrganizationTier,
} from "@/lib/constants/statuses";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { invalidateEntitlementsCache } from "@/lib/platform/entitlements/resolve";
import { generateBillingInvoice } from "./invoiceGenerator";
import { DEFAULT_SELLER_STATE } from "./proration";

function mapPlanKeyToTier(planKey: PlanKeyType): OrganizationTier {
  switch (planKey) {
    case PLAN_KEY.ENTERPRISE:
    case PLAN_KEY.CUSTOM:
      return ORGANIZATION_TIER.ENTERPRISE;
    case PLAN_KEY.PRO:
    case PLAN_KEY.BUSINESS:
    case PLAN_KEY.GROWTH:
      return ORGANIZATION_TIER.PROFESSIONAL;
    case PLAN_KEY.FREE:
    case PLAN_KEY.STARTER:
    default:
      return ORGANIZATION_TIER.STARTER;
  }
}

/**
 * Sweeps and activates scheduled downgrades whose effectiveDate has arrived.
 */
export async function runScheduledDowngradesSweep(): Promise<{ processed: number }> {
  await connectDB();
  const now = new Date();
  const dueDowngrades = await SaaSSubscription.find({
    "scheduledChange.effectiveDate": { $lte: now },
  });

  let processed = 0;
  for (const sub of dueDowngrades) {
    if (!sub.scheduledChange) continue;
    const targetPlanKey = sub.scheduledChange.planKey;
    const targetDef = PLAN_DEFINITIONS[targetPlanKey];

    sub.planKey = targetPlanKey;
    if (targetDef) {
      sub.currentPrice =
        sub.billingCycle === "yearly" ? targetDef.priceYearly : targetDef.priceMonthly;
    }
    sub.set("scheduledChange", undefined);
    await sub.save();

    await OrganizationEntitlement.findOneAndUpdate(
      { tenantId: sub.tenantId },
      {
        $set: {
          planKey: targetPlanKey,
          assignedAt: now,
          effectiveFrom: now,
        },
      },
      { upsert: true }
    );
    invalidateEntitlementsCache(sub.tenantId);

    const newTier = mapPlanKeyToTier(targetPlanKey);
    const org = await Organization.findOne({ subdomain: sub.tenantId });
    if (org) {
      org.tier = newTier;
      if (targetDef?.features) {
        org.maxUsers = targetDef.features.maxUsers;
        org.aiCallsPerMonth = targetDef.features.aiCreditsPerMonth;
      }
      await org.save();
    }

    await appendSubscriptionEvent({
      tenantId: sub.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED,
      tier: newTier,
      meta: {
        action: "scheduled_downgrade_applied",
        newPlanKey: targetPlanKey,
      },
    });

    processed++;
  }

  return { processed };
}


/**
 * Sweeps subscriptions whose 3-day grace period has expired, transitioning them to suspended.
 */
export async function runGracePeriodExpirySweep(): Promise<{ suspendedCount: number }> {
  await connectDB();
  const now = new Date();
  const expiredGrace = await SaaSSubscription.find({
    "gracePeriod.isInGrace": true,
    "gracePeriod.graceEndsAt": { $lte: now },
    status: SAAS_SUBSCRIPTION_STATUS.PAST_DUE,
  });

  let suspendedCount = 0;
  for (const sub of expiredGrace) {
    sub.status = SAAS_SUBSCRIPTION_STATUS.SUSPENDED;
    sub.gracePeriod.isInGrace = false;
    await sub.save();

    const org = await Organization.findOne({ subdomain: sub.tenantId });
    if (org) {
      org.subscriptionStatus = "suspended";
      await org.save();
    }

    await appendSubscriptionEvent({
      tenantId: sub.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.PAYMENT_FAILED,
      tier: mapPlanKeyToTier(sub.planKey),
      meta: {
        action: "grace_period_expired_suspended",
        graceEndedAt: now,
      },
    });

    suspendedCount++;
  }

  return { suspendedCount };
}

/**
 * Sweeps cancelled subscriptions whose paidThroughDate has arrived,
 * safely expiring them and updating entitlements to base tier.
 */
export async function runExpiredCancellationsSweep(): Promise<{ expiredCount: number }> {
  await connectDB();
  const now = new Date();
  const dueCancellations = await SaaSSubscription.find({
    status: SAAS_SUBSCRIPTION_STATUS.CANCELLED,
    $or: [
      { "cancellation.effectiveDate": { $lte: now } },
      { paidThroughDate: { $lte: now } },
    ],
  });

  let expiredCount = 0;
  for (const sub of dueCancellations) {
    sub.status = SAAS_SUBSCRIPTION_STATUS.EXPIRED;
    await sub.save();

    await OrganizationEntitlement.findOneAndUpdate(
      { tenantId: sub.tenantId },
      {
        $set: {
          planKey: PLAN_KEY.STARTER,
          assignedAt: now,
          effectiveFrom: now,
        },
      },
      { upsert: true }
    );
    invalidateEntitlementsCache(sub.tenantId);

    const org = await Organization.findOne({ subdomain: sub.tenantId });
    if (org) {
      org.subscriptionStatus = "expired";
      org.tier = ORGANIZATION_TIER.STARTER;
      await org.save();
    }

    await appendSubscriptionEvent({
      tenantId: sub.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED,
      tier: ORGANIZATION_TIER.STARTER,
      meta: {
        action: "cancellation_period_elapsed_expired",
        previousPlanKey: sub.planKey,
        expiredAt: now,
      },
    });

    expiredCount++;
  }

  return { expiredCount };
}

/**
 * Reconciles automatic renewals for subscriptions due for recurring billing.
 */
export async function runAutoRenewalSweep(): Promise<{ renewedCount: number }> {
  await connectDB();
  const now = new Date();
  const dueRenewals = await SaaSSubscription.find({
    status: SAAS_SUBSCRIPTION_STATUS.ACTIVE,
    "autoPay.enabled": true,
    nextRenewalDate: { $lte: now },
  });

  let renewedCount = 0;
  for (const sub of dueRenewals) {
    const org = await Organization.findOne({ subdomain: sub.tenantId });
    const renewalPrice = sub.currentPrice;

    if (renewalPrice <= 0) {
      // Free plan automatic period rollover
      const nextEnd = new Date(sub.nextRenewalDate);
      nextEnd.setMonth(nextEnd.getMonth() + 1);
      sub.currentPeriodStart = sub.nextRenewalDate;
      sub.currentPeriodEnd = nextEnd;
      sub.paidThroughDate = nextEnd;
      sub.nextRenewalDate = nextEnd;
      await sub.save();
      continue;
    }

    // Process renewal payment
    const idempotencyKey = `ren_${sub.tenantId}_${Date.now()}`;
    const gstRate = 18;
    const isInterState =
      (org?.settings?.state || DEFAULT_SELLER_STATE).toLowerCase() !==
      DEFAULT_SELLER_STATE.toLowerCase();

    let cgst = 0,
      sgst = 0,
      igst = 0;
    if (isInterState) {
      igst = Math.round(((renewalPrice * gstRate) / 100) * 100) / 100;
    } else {
      cgst = Math.round(((renewalPrice * (gstRate / 2)) / 100) * 100) / 100;
      sgst = cgst;
    }
    const totalTax = cgst + sgst + igst;
    const totalAmount = Math.round((renewalPrice + totalTax) * 100) / 100;

    const payment = await BillingPayment.create({
      tenantId: sub.tenantId,
      organizationId: org?._id,
      subscriptionId: sub._id,
      type: BILLING_PAYMENT_TYPE.RENEWAL,
      amount: totalAmount,
      currency: sub.currency,
      status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
      billingCycle: sub.billingCycle,
      razorpayPaymentId: `pay_auto_${Date.now()}`,
      paymentMethod: sub.autoPay.paymentMethod?.type || "mandate",
      taxBreakup: {
        taxableAmount: renewalPrice,
        cgst,
        sgst,
        igst,
        totalTax,
        isInterState,
      },
      idempotencyKey,
    });

    const nextEnd = new Date(sub.nextRenewalDate);
    if (sub.billingCycle === "yearly") {
      nextEnd.setFullYear(nextEnd.getFullYear() + 1);
    } else {
      nextEnd.setMonth(nextEnd.getMonth() + 1);
    }

    sub.currentPeriodStart = sub.nextRenewalDate;
    sub.currentPeriodEnd = nextEnd;
    sub.paidThroughDate = nextEnd;
    sub.nextRenewalDate = nextEnd;
    sub.gracePeriod.isInGrace = false;
    sub.lastPaymentId = payment.razorpayPaymentId;
    await sub.save();

    await generateBillingInvoice({
      payment,
      subscription: sub,
      description: `Subscription Renewal for ${sub.planKey.toUpperCase()} Plan (${sub.billingCycle})`,
    });

    await appendSubscriptionEvent({
      tenantId: sub.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.RENEWED,
      tier: mapPlanKeyToTier(sub.planKey),
      amount: totalAmount,
      currency: sub.currency,
      meta: {
        paymentId: payment._id,
        nextRenewalDate: nextEnd,
      },
    });

    renewedCount++;
  }

  return { renewedCount };
}
