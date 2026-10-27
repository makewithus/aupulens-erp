import connectDB from "@/lib/db";
import SaaSSubscription, { SAAS_SUBSCRIPTION_STATUS } from "@/models/billing/SaaSSubscription";
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
import { enqueueBillingNotification } from "@/lib/billing/notifications";
import { razorpayService } from "@/lib/billing/razorpayClient";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";

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
export async function runAutoRenewalSweep(): Promise<{ renewedCount: number; blockedCount: number }> {
  await connectDB();
  const now = new Date();
  const dueRenewals = await SaaSSubscription.find({
    status: SAAS_SUBSCRIPTION_STATUS.ACTIVE,
    nextRenewalDate: { $lte: now },
  });

  let renewedCount = 0;
  let blockedCount = 0;
  for (const sub of dueRenewals) {
    const renewalPrice = sub.currentPrice;

    if (renewalPrice <= 0) {
      // Free plan automatic period rollover
      const nextEnd = new Date(sub.nextRenewalDate);
      if (sub.billingCycle === "yearly") nextEnd.setFullYear(nextEnd.getFullYear() + 1);
      else nextEnd.setMonth(nextEnd.getMonth() + 1);
      sub.currentPeriodStart = sub.nextRenewalDate;
      sub.currentPeriodEnd = nextEnd;
      sub.paidThroughDate = nextEnd;
      sub.nextRenewalDate = nextEnd;
      await sub.save();
      continue;
    }

    if (sub.autoPay.enabled && sub.autoPay.status === "active" && sub.razorpaySubscriptionId) {
      try {
        const provider = await razorpayService.fetchSubscription(sub.razorpaySubscriptionId);
        if (["active", "authenticated"].includes(provider.status)) {
          // Razorpay owns the charge schedule and retries for Subscriptions.
          // A due local date alone is not evidence of a failed collection; wait
          // for the signed charged/pending/halted callback.
          blockedCount++;
          continue;
        }
        if (["pending", "halted"].includes(provider.status)) {
          await subscriptionManager.handlePaymentFailure({
            tenantId: sub.tenantId,
            reason: `Razorpay renewal is ${provider.status}; provider retries remain authoritative.`,
            providerEventId: `status_${provider.id}_${provider.status}_${provider.paid_count}`,
          });
          blockedCount++;
          continue;
        }
        await subscriptionManager.handlePaymentFailure({
          tenantId: sub.tenantId,
          reason: `Razorpay subscription ended in ${provider.status} state before the renewal was collected.`,
          providerEventId: `terminal_${provider.id}_${provider.status}_${provider.paid_count}`,
        });
        blockedCount++;
        continue;
      } catch {
        // An unavailable provider lookup is an unknown state. Keep access dates
        // unchanged and retry reconciliation on the next sweep.
        blockedCount++;
        continue;
      }
    }

    // No provider-authorized renewal exists. Never synthesize success or extend
    // paid access; enter the existing grace workflow and await manual recovery.
    const graceEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const updated = await SaaSSubscription.findOneAndUpdate(
      {
        _id: sub._id,
        status: SAAS_SUBSCRIPTION_STATUS.ACTIVE,
        nextRenewalDate: { $lte: now },
      },
      {
        $set: {
          status: SAAS_SUBSCRIPTION_STATUS.PAST_DUE,
          "gracePeriod.isInGrace": true,
          "gracePeriod.graceStartedAt": now,
          "gracePeriod.graceEndsAt": graceEndsAt,
          "gracePeriod.lastFailedAt": now,
          "gracePeriod.lastFailureReason": "Automatic renewal blocked: no active customer-authorized provider subscription exists.",
        },
      },
      { new: true }
    );
    if (!updated) continue;

    await Organization.updateOne(
      { subdomain: sub.tenantId },
      { $set: { subscriptionStatus: "past_due" } }
    );
    await appendSubscriptionEvent({
      tenantId: sub.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.RENEWAL_BLOCKED,
      tier: mapPlanKeyToTier(sub.planKey),
      meta: {
        action: "renewal_blocked_provider_charge_unavailable",
        reason: "No active customer-authorized provider subscription exists.",
        graceEndsAt,
      },
    });
    await enqueueBillingNotification({
      tenantId: sub.tenantId,
      idempotencyKey: `billing-renewal-blocked:${sub._id}:${sub.nextRenewalDate.getTime()}`,
      eventType: "renewal_failure",
      subject: "Action required to renew your Aupulens subscription",
      body: `We could not automatically renew your ${sub.planKey} plan because a provider-authorized recurring payment is not configured. The current grace period ends ${graceEndsAt.toISOString()}.`,
    });
    blockedCount++;
  }

  return { renewedCount, blockedCount };
}
