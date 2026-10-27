import crypto from "node:crypto";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import SaaSSubscription, {
  ISaaSSubscription,
  SAAS_SUBSCRIPTION_STATUS,
} from "@/models/billing/SaaSSubscription";
import BillingPayment, {
  BILLING_PAYMENT_STATUS,
  BILLING_PAYMENT_TYPE,
  IBillingPayment,
} from "@/models/billing/BillingPayment";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import {
  ORGANIZATION_TIER,
  PLAN_KEY,
  PlanKeyType,
  SUBSCRIPTION_EVENT_TYPE,
  type OrganizationTier,
} from "@/lib/constants/statuses";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import {
  bridgeTierToPlanKey,
  invalidateEntitlementsCache,
} from "@/lib/platform/entitlements/resolve";
import { calculateProration, DEFAULT_SELLER_STATE } from "./proration";
import { razorpayService } from "./razorpayClient";
import { generateBillingInvoice } from "./invoiceGenerator";
import { validateSubscriptionTransition } from "./stateMachine";

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

export class SubscriptionManager {
  /**
   * Retrieves or initializes the authoritative SaaSSubscription record for a tenant.
   */
  public async getOrCreateSubscription(tenantId: string): Promise<ISaaSSubscription> {
    await connectDB();
    let subscription = await SaaSSubscription.findOne({ tenantId });

    if (!subscription) {
      const org = await Organization.findOne({ subdomain: tenantId });
      const planKey = org?.tier ? bridgeTierToPlanKey(org.tier) : PLAN_KEY.STARTER;
      const planDef = PLAN_DEFINITIONS[planKey] || PLAN_DEFINITIONS[PLAN_KEY.STARTER];

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      subscription = await SaaSSubscription.create({
        tenantId,
        organizationId: org?._id,
        planKey,
        status:
          org?.subscriptionStatus === "active"
            ? SAAS_SUBSCRIPTION_STATUS.ACTIVE
            : SAAS_SUBSCRIPTION_STATUS.TRIAL,
        billingCycle: "monthly",
        currentPrice: planDef.priceMonthly,
        currency: "INR",
        startDate: org?.createdAt || now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        paidThroughDate: periodEnd,
        nextRenewalDate: periodEnd,
        trialEndDate: org?.trialEndDate,
        autoPay: {
          enabled: false,
          status: "not_configured",
        },
        gracePeriod: {
          isInGrace: false,
          failedAttemptsCount: 0,
        },
      });
    }

    return subscription;
  }

  /**
   * Calculates upgrade proration and creates a pending payment intent/order.
   */
  public async prepareUpgrade(params: {
    tenantId: string;
    targetPlanKey: PlanKeyType;
    billingCycle?: "monthly" | "yearly";
  }) {
    await connectDB();
    const subscription = await this.getOrCreateSubscription(params.tenantId);
    const org = await Organization.findOne({ subdomain: params.tenantId });

    const targetDef = PLAN_DEFINITIONS[params.targetPlanKey];
    if (!targetDef) {
      throw new Error(`Target plan ${params.targetPlanKey} not found in catalog.`);
    }

    const cycle = params.billingCycle || subscription.billingCycle || "monthly";
    const targetPrice = cycle === "yearly" ? targetDef.priceYearly : targetDef.priceMonthly;

    // Proration calculation
    const proration = calculateProration({
      currentPlanPrice: subscription.currentPrice,
      targetPlanPrice: targetPrice,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      sellerState: DEFAULT_SELLER_STATE,
      customerState: org?.settings?.state || DEFAULT_SELLER_STATE,
    });

    const idempotencyKey = `upg_${params.tenantId}_${params.targetPlanKey}_${Date.now()}`;

    // Create Razorpay order
    const order = await razorpayService.createOrder({
      amount: proration.totalAmount,
      currency: "INR",
      receipt: idempotencyKey,
      notes: {
        tenantId: params.tenantId,
        targetPlanKey: params.targetPlanKey,
        type: BILLING_PAYMENT_TYPE.UPGRADE,
      },
    });

    // Persist pending payment record
    const payment = await BillingPayment.create({
      tenantId: params.tenantId,
      organizationId: org?._id,
      subscriptionId: subscription._id,
      type: BILLING_PAYMENT_TYPE.UPGRADE,
      amount: proration.totalAmount,
      currency: "INR",
      status: BILLING_PAYMENT_STATUS.PENDING,
      billingCycle: cycle,
      razorpayOrderId: order.id,
      taxBreakup: {
        taxableAmount: proration.proratedAmount,
        cgst: proration.cgst,
        sgst: proration.sgst,
        igst: proration.igst,
        totalTax: proration.totalTax,
        isInterState: proration.isInterState,
      },
      upgradeDetails: {
        fromPlan: subscription.planKey,
        toPlan: params.targetPlanKey,
        proratedAmount: proration.proratedAmount,
        daysRemaining: proration.daysRemaining,
        totalDaysInCycle: proration.totalDaysInCycle,
        prorationFraction: proration.prorationFraction,
      },
      idempotencyKey,
    });

    return {
      subscription,
      proration,
      order,
      paymentId: String(payment._id),
      keyId: razorpayService.getKeyId(),
    };
  }

  /**
   * Verifies Razorpay payment signature server-side and applies the plan upgrade immediately.
   */
  public async verifyAndApplyUpgrade(params: {
    tenantId: string;
    paymentId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) {
    await connectDB();
    const payment = await BillingPayment.findById(params.paymentId);
    if (!payment) {
      throw new Error("Payment record not found.");
    }

    if (payment.tenantId !== params.tenantId) {
      throw new Error("Cross-tenant payment mismatch rejected.");
    }

    if (payment.status === BILLING_PAYMENT_STATUS.SUCCESSFUL) {
      // Idempotent duplicate return
      const invoice = await (await import("@/models/billing/BillingInvoice")).default.findOne({
        paymentId: payment._id,
      });
      const subscription = await this.getOrCreateSubscription(params.tenantId);
      return { success: true, subscription, payment, invoice, idempotent: true };
    }

    // Verify cryptographic signature
    const isValid = razorpayService.verifyPaymentSignature({
      razorpayOrderId: params.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId,
      razorpaySignature: params.razorpaySignature,
    });

    if (!isValid) {
      payment.status = BILLING_PAYMENT_STATUS.FAILED;
      payment.failureReason = "Signature mismatch on server-side verification.";
      await payment.save();
      throw new Error("Invalid Razorpay payment signature.");
    }

    // Update payment record
    payment.status = BILLING_PAYMENT_STATUS.SUCCESSFUL;
    payment.razorpayPaymentId = params.razorpayPaymentId;
    payment.razorpaySignature = params.razorpaySignature;
    await payment.save();

    // Authoritative subscription update
    const subscription = await this.getOrCreateSubscription(params.tenantId);
    const targetPlanKey = (payment.upgradeDetails?.toPlan as PlanKeyType) || subscription.planKey;
    const targetDef = PLAN_DEFINITIONS[targetPlanKey];

    validateSubscriptionTransition(subscription.status, SAAS_SUBSCRIPTION_STATUS.ACTIVE);
    subscription.status = SAAS_SUBSCRIPTION_STATUS.ACTIVE;
    subscription.planKey = targetPlanKey;
    if (targetDef) {
      subscription.currentPrice =
        payment.billingCycle === "yearly" ? targetDef.priceYearly : targetDef.priceMonthly;
    }
    subscription.lastPaymentId = params.razorpayPaymentId;

    // Clear any previous scheduled downgrade or cancellation
    subscription.set("scheduledChange", undefined);
    subscription.set("cancellation", undefined);
    subscription.gracePeriod.isInGrace = false;
    await subscription.save();

    // Synchronize Organization Entitlements
    await OrganizationEntitlement.findOneAndUpdate(
      { tenantId: params.tenantId },
      {
        $set: {
          planKey: targetPlanKey,
          assignedAt: new Date(),
          effectiveFrom: new Date(),
        },
        $unset: { overrides: "" },
      },
      { upsert: true }
    );
    invalidateEntitlementsCache(params.tenantId);

    // Update Organization model fields for compatibility
    const newTier = mapPlanKeyToTier(targetPlanKey);
    const org = await Organization.findOne({ subdomain: params.tenantId });
    if (org) {
      org.tier = newTier;
      org.subscriptionStatus = "active";
      if (targetDef?.features) {
        org.maxUsers = targetDef.features.maxUsers;
        org.aiCallsPerMonth = targetDef.features.aiCreditsPerMonth;
      }
      await org.save();
    }

    // Record subscription event
    await appendSubscriptionEvent({
      tenantId: params.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.UPGRADED,
      tier: newTier,
      amount: payment.amount,
      currency: payment.currency,
      meta: {
        fromPlan: payment.upgradeDetails?.fromPlan,
        toPlan: targetPlanKey,
        paymentId: payment._id,
        razorpayPaymentId: params.razorpayPaymentId,
      },
    });

    // Generate compliant tax invoice
    const invoice = await generateBillingInvoice({
      payment,
      subscription,
    });

    return { success: true, subscription, payment, invoice };
  }

  /**
   * Schedules a downgrade to become effective on the next renewal date.
   * Customer data and current entitlements are fully preserved until that date.
   */
  public async scheduleDowngrade(params: {
    tenantId: string;
    targetPlanKey: PlanKeyType;
    reason?: string;
  }): Promise<ISaaSSubscription> {
    await connectDB();
    const subscription = await this.getOrCreateSubscription(params.tenantId);

    subscription.scheduledChange = {
      planKey: params.targetPlanKey,
      effectiveDate: subscription.nextRenewalDate,
      requestedAt: new Date(),
      reason: params.reason,
    };

    await subscription.save();

    await appendSubscriptionEvent({
      tenantId: params.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED,
      tier: mapPlanKeyToTier(subscription.planKey),
      meta: {
        scheduledDowngradeTo: params.targetPlanKey,
        effectiveDate: subscription.nextRenewalDate,
        reason: params.reason,
      },
    });

    return subscription;
  }

  /**
   * Cancels a pending scheduled downgrade.
   */
  public async cancelScheduledDowngrade(tenantId: string): Promise<ISaaSSubscription> {
    await connectDB();
    const subscription = await this.getOrCreateSubscription(tenantId);
    subscription.set("scheduledChange", undefined);
    await subscription.save();
    return subscription;
  }

  /**
   * Cancels an active subscription. Future renewals are stopped, but paid access
   * is maintained through paidThroughDate.
   */
  public async cancelSubscription(params: {
    tenantId: string;
    reason?: string;
  }): Promise<ISaaSSubscription> {
    await connectDB();
    const subscription = await this.getOrCreateSubscription(params.tenantId);

    validateSubscriptionTransition(subscription.status, SAAS_SUBSCRIPTION_STATUS.CANCELLED);
    subscription.status = SAAS_SUBSCRIPTION_STATUS.CANCELLED;
    subscription.cancellation = {
      requestedAt: new Date(),
      effectiveDate: subscription.paidThroughDate,
      reason: params.reason,
    };
    subscription.set("scheduledChange", undefined);
    await subscription.save();

    await appendSubscriptionEvent({
      tenantId: params.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.CANCELED,
      tier: mapPlanKeyToTier(subscription.planKey),
      meta: {
        effectiveDate: subscription.paidThroughDate,
        reason: params.reason,
      },
    });

    return subscription;
  }

  /**
   * Reactivates a cancelled subscription prior to the paidThroughDate.
   */
  public async reactivateSubscription(tenantId: string): Promise<ISaaSSubscription> {
    await connectDB();
    const subscription = await this.getOrCreateSubscription(tenantId);

    if (subscription.status !== SAAS_SUBSCRIPTION_STATUS.CANCELLED) {
      throw new Error("Subscription is not in cancelled status.");
    }

    if (new Date(subscription.paidThroughDate).getTime() < Date.now()) {
      throw new Error("Paid-through period has already elapsed. Please start a new subscription.");
    }

    validateSubscriptionTransition(subscription.status, SAAS_SUBSCRIPTION_STATUS.ACTIVE);
    subscription.status = SAAS_SUBSCRIPTION_STATUS.ACTIVE;
    subscription.set("cancellation", undefined);
    await subscription.save();

    await appendSubscriptionEvent({
      tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.RENEWED,
      tier: mapPlanKeyToTier(subscription.planKey),
      meta: { action: "reactivated" },
    });

    return subscription;
  }

  /**
   * Initiates payment failure handling and activates the 3-day grace period.
   */
  public async handlePaymentFailure(params: {
    tenantId: string;
    reason?: string;
  }): Promise<ISaaSSubscription> {
    await connectDB();
    const subscription = await this.getOrCreateSubscription(params.tenantId);

    const now = new Date();
    const graceEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3-day grace period

    validateSubscriptionTransition(subscription.status, SAAS_SUBSCRIPTION_STATUS.PAST_DUE);
    subscription.status = SAAS_SUBSCRIPTION_STATUS.PAST_DUE;
    subscription.gracePeriod = {
      isInGrace: true,
      graceStartedAt: subscription.gracePeriod.graceStartedAt || now,
      graceEndsAt: subscription.gracePeriod.graceEndsAt || graceEndsAt,
      failedAttemptsCount: (subscription.gracePeriod.failedAttemptsCount || 0) + 1,
      lastFailedAt: now,
      lastFailureReason: params.reason || "Payment charge failed.",
    };

    await subscription.save();

    // Persist failed payment record for tracking, history, and analytics
    const org = await Organization.findOne({ subdomain: params.tenantId });
    const idempotencyKey = `fail_${params.tenantId}_${now.getTime()}_${subscription.gracePeriod.failedAttemptsCount}`;
    await BillingPayment.create({
      tenantId: params.tenantId,
      organizationId: org?._id,
      subscriptionId: subscription._id,
      type: BILLING_PAYMENT_TYPE.RENEWAL,
      amount: subscription.currentPrice,
      currency: subscription.currency || "INR",
      status: BILLING_PAYMENT_STATUS.FAILED,
      billingCycle: subscription.billingCycle || "monthly",
      failureReason: params.reason || "Payment charge failed.",
      taxBreakup: {
        taxableAmount: subscription.currentPrice,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalTax: 0,
        isInterState: false,
      },
      idempotencyKey,
    });

    await appendSubscriptionEvent({
      tenantId: params.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.PAYMENT_FAILED,
      tier: mapPlanKeyToTier(subscription.planKey),
      meta: {
        reason: params.reason,
        graceEndsAt: subscription.gracePeriod.graceEndsAt,
      },
    });

    return subscription;
  }
}

export const subscriptionManager = new SubscriptionManager();
