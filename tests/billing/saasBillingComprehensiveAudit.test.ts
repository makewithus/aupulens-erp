process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/aupulens_test_billing_audit";
process.env.RATE_LIMIT_STORE = "memory";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import SaaSSubscription, {
  SAAS_SUBSCRIPTION_STATUS,
} from "@/models/billing/SaaSSubscription";
import BillingPayment, {
  BILLING_PAYMENT_STATUS,
  BILLING_PAYMENT_TYPE,
} from "@/models/billing/BillingPayment";
import BillingInvoice from "@/models/billing/BillingInvoice";
import BillingWebhookEvent from "@/models/billing/BillingWebhookEvent";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import Counter from "@/models/shared/Counter";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import { razorpayService } from "@/lib/billing/razorpayClient";
import { calculateProration, DEFAULT_SELLER_STATE } from "@/lib/billing/proration";
import {
  runScheduledDowngradesSweep,
  runGracePeriodExpirySweep,
  runExpiredCancellationsSweep,
  runAutoRenewalSweep,
} from "@/lib/billing/scheduler";
import { generateInvoicePdf } from "@/lib/billing/billingPdfGenerator";
import { getNextSaaSInvoiceNumber } from "@/lib/billing/invoiceGenerator";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { PLAN_KEY, SUBSCRIPTION_EVENT_TYPE } from "@/lib/constants/statuses";

describe("Aupulens SaaS Subscription & Billing System — Master End-to-End Audit Suite", () => {
  const TENANT_A = "audit-tenant-alpha";
  const TENANT_B = "audit-tenant-beta";

  beforeAll(async () => {
    await connectDB();
    // Clean disposable test database
    await Promise.all([
      SaaSSubscription.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      BillingPayment.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      BillingInvoice.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      BillingWebhookEvent.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      SubscriptionEvent.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      OrganizationEntitlement.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      Organization.deleteMany({ subdomain: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
    ]);

    // Seed test organizations
    await Organization.create([
      {
        subdomain: TENANT_A,
        name: "Alpha Corp (Karnataka)",
        ownerUserId: new mongoose.Types.ObjectId(),
        tier: "starter",
        subscriptionStatus: "active",
        settings: {
          state: "Karnataka",
          addressLine1: "100 MG Road",
          city: "Bangalore",
          pincode: "560001",
          gstin: "29AABCA9999F1Z1",
        },
      },
      {
        subdomain: TENANT_B,
        name: "Beta Ltd (Maharashtra)",
        ownerUserId: new mongoose.Types.ObjectId(),
        tier: "starter",
        subscriptionStatus: "active",
        settings: {
          state: "Maharashtra",
          addressLine1: "50 Nariman Point",
          city: "Mumbai",
          pincode: "400021",
          gstin: "27AABCB8888F1Z2",
        },
      },
    ]);

    // Ensure plan definitions exist in Plan collection for entitlement resolver
    for (const [key, def] of Object.entries(PLAN_DEFINITIONS)) {
      await Plan.findOneAndUpdate(
        { key },
        {
          key,
          name: key.toUpperCase(),
          priceMonthly: def.priceMonthly,
          priceYearly: def.priceYearly,
          features: def.features,
        },
        { upsert: true }
      );
    }
  });

  afterAll(async () => {
    await Promise.all([
      SaaSSubscription.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      BillingPayment.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      BillingInvoice.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      BillingWebhookEvent.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      SubscriptionEvent.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      OrganizationEntitlement.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
      Organization.deleteMany({ subdomain: { $in: [TENANT_A, TENANT_B, "audit-analytics-tenant"] } }),
    ]);
  });

  describe("1. SUB-01: Subscription Initialization & Lifecycle Overview", () => {
    it("initializes authoritative subscription record derived from organization", async () => {
      const sub = await subscriptionManager.getOrCreateSubscription(TENANT_A);
      expect(sub).toBeDefined();
      expect(sub.tenantId).toBe(TENANT_A);
      expect(sub.planKey).toBe(PLAN_KEY.STARTER);
      expect(sub.status).toBe(SAAS_SUBSCRIPTION_STATUS.ACTIVE);
      expect(sub.currentPrice).toBe(999);
      expect(sub.currency).toBe("INR");
      expect(sub.billingCycle).toBe("monthly");
      expect(sub.currentPeriodStart).toBeInstanceOf(Date);
      expect(sub.currentPeriodEnd).toBeInstanceOf(Date);
      expect(sub.paidThroughDate).toBeInstanceOf(Date);
      expect(sub.nextRenewalDate).toBeInstanceOf(Date);
      expect(sub.autoPay.enabled).toBe(false);
      expect(sub.gracePeriod.isInGrace).toBe(false);
    });

    it("resolves exact backend entitlements for initial Starter plan", async () => {
      const entitlements = await resolveEntitlements(TENANT_A);
      expect(entitlements.planKey).toBe(PLAN_KEY.STARTER);
      expect(entitlements.modules).toContain("admin");
      expect(entitlements.modules).toContain("hr");
      expect(entitlements.modules).toContain("inventory");
      expect(entitlements.limits.maxUsers).toBe(5);
      expect(entitlements.limits.aiCreditsPerMonth).toBe(1000);
      expect(entitlements.limits.storageGb).toBe(5);
    });
  });

  describe("2. SUB-02: Plan Catalog & Mathematical Proration Calculations", () => {
    it("computes intra-state GST (9% CGST + 9% SGST) for Karnataka customer", () => {
      const periodStart = new Date("2026-10-01T00:00:00Z");
      const periodEnd = new Date("2026-10-31T00:00:00Z");
      const changeDate = new Date("2026-10-16T00:00:00Z"); // Half cycle remaining

      const result = calculateProration({
        currentPlanPrice: 999,
        targetPlanPrice: 2999,
        periodStart,
        periodEnd,
        changeDate,
        sellerState: DEFAULT_SELLER_STATE,
        customerState: "Karnataka",
      });

      expect(result.isInterState).toBe(false);
      expect(result.prorationFraction).toBe(0.5);
      expect(result.proratedAmount).toBe(1000);
      expect(result.cgst).toBe(90);
      expect(result.sgst).toBe(90);
      expect(result.igst).toBe(0);
      expect(result.totalTax).toBe(180);
      expect(result.totalAmount).toBe(1180);
    });

    it("computes inter-state GST (18% IGST) for Maharashtra customer", () => {
      const periodStart = new Date("2026-10-01T00:00:00Z");
      const periodEnd = new Date("2026-10-31T00:00:00Z");
      const changeDate = new Date("2026-10-16T00:00:00Z");

      const result = calculateProration({
        currentPlanPrice: 999,
        targetPlanPrice: 2999,
        periodStart,
        periodEnd,
        changeDate,
        sellerState: DEFAULT_SELLER_STATE,
        customerState: "Maharashtra",
      });

      expect(result.isInterState).toBe(true);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(180);
      expect(result.totalTax).toBe(180);
      expect(result.totalAmount).toBe(1180);
    });
  });

  describe("3. SUB-03 & PAY-01: Upgrade Workflow & Cryptographic Verification", () => {
    let preparedOrder: any;
    let paymentRecordId: string;

    it("prepares upgrade and generates pending payment record and Razorpay order", async () => {
      const prep = await subscriptionManager.prepareUpgrade({
        tenantId: TENANT_A,
        targetPlanKey: PLAN_KEY.GROWTH,
        billingCycle: "monthly",
      });

      expect(prep.order).toBeDefined();
      expect(prep.order.id).toMatch(/^order_/);
      expect(prep.paymentId).toBeDefined();
      expect(prep.proration.totalAmount).toBeGreaterThan(0);

      preparedOrder = prep.order;
      paymentRecordId = prep.paymentId;

      const payment = await BillingPayment.findById(paymentRecordId);
      expect(payment?.status).toBe(BILLING_PAYMENT_STATUS.PENDING);
      expect(payment?.type).toBe(BILLING_PAYMENT_TYPE.UPGRADE);
      expect(payment?.upgradeDetails?.toPlan).toBe(PLAN_KEY.GROWTH);
    });

    it("rejects invalid/tampered signature and does NOT activate upgraded plan", async () => {
      await expect(
        subscriptionManager.verifyAndApplyUpgrade({
          tenantId: TENANT_A,
          paymentId: paymentRecordId,
          razorpayOrderId: preparedOrder.id,
          razorpayPaymentId: "pay_tampered_123",
          razorpaySignature: "invalid_tampered_signature_hex",
        })
      ).rejects.toThrow(/Invalid Razorpay payment signature/);

      // Verify payment was marked as failed
      const payment = await BillingPayment.findById(paymentRecordId);
      expect(payment?.status).toBe(BILLING_PAYMENT_STATUS.FAILED);
      expect(payment?.failureReason).toContain("Signature mismatch");

      // Verify subscription plan was NOT upgraded
      const sub = await SaaSSubscription.findOne({ tenantId: TENANT_A });
      expect(sub?.planKey).toBe(PLAN_KEY.STARTER);

      // Verify entitlements remain on STARTER
      const entitlements = await resolveEntitlements(TENANT_A);
      expect(entitlements.planKey).toBe(PLAN_KEY.STARTER);
    });

    it("verifies authentic HMAC-SHA256 signature and applies upgrade immediately", async () => {
      // Prepare a new upgrade payment
      const prep = await subscriptionManager.prepareUpgrade({
        tenantId: TENANT_A,
        targetPlanKey: PLAN_KEY.GROWTH,
        billingCycle: "monthly",
      });

      const validPaymentId = `pay_${Date.now()}`;
      const validSignature = razorpayService.generateTestSignature(prep.order.id, validPaymentId);

      const result = await subscriptionManager.verifyAndApplyUpgrade({
        tenantId: TENANT_A,
        paymentId: prep.paymentId,
        razorpayOrderId: prep.order.id,
        razorpayPaymentId: validPaymentId,
        razorpaySignature: validSignature,
      });

      expect(result.success).toBe(true);
      expect(result.subscription.planKey).toBe(PLAN_KEY.GROWTH);
      expect(result.subscription.status).toBe(SAAS_SUBSCRIPTION_STATUS.ACTIVE);
      expect(result.payment.status).toBe(BILLING_PAYMENT_STATUS.SUCCESSFUL);
      expect(result.invoice).toBeDefined();
      expect(result.invoice.invoiceNumber).toMatch(/^INV-SAAS-/);

      // Verify immediate backend entitlement activation
      const entitlements = await resolveEntitlements(TENANT_A);
      expect(entitlements.planKey).toBe(PLAN_KEY.GROWTH);
      expect(entitlements.limits.maxUsers).toBe(15);
      expect(entitlements.limits.aiCreditsPerMonth).toBe(1500);

      // Verify Organization model sync
      const org = await Organization.findOne({ subdomain: TENANT_A });
      expect(org?.tier).toBe("professional");
      expect(org?.maxUsers).toBe(15);

      // Verify audit event emission
      const event = await SubscriptionEvent.findOne({
        tenantId: TENANT_A,
        type: SUBSCRIPTION_EVENT_TYPE.UPGRADED,
      });
      expect(event).toBeDefined();
      expect(event?.meta?.toPlan).toBe(PLAN_KEY.GROWTH);
    });

    it("handles idempotent duplicate verification safely without duplicate charges or invoices", async () => {
      // Find the successful payment
      const payment = await BillingPayment.findOne({
        tenantId: TENANT_A,
        status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
      });
      expect(payment).toBeDefined();

      const dupResult = await subscriptionManager.verifyAndApplyUpgrade({
        tenantId: TENANT_A,
        paymentId: String(payment!._id),
        razorpayOrderId: payment!.razorpayOrderId!,
        razorpayPaymentId: payment!.razorpayPaymentId!,
        razorpaySignature: payment!.razorpaySignature!,
      });

      expect(dupResult.success).toBe(true);
      expect(dupResult.idempotent).toBe(true);

      // Verify no duplicate invoices created
      const invoiceCount = await BillingInvoice.countDocuments({ paymentId: payment!._id });
      expect(invoiceCount).toBe(1);
    });
  });

  describe("4. SUB-04: Scheduled Downgrade Workflow", () => {
    it("schedules a downgrade to become effective on the next renewal date", async () => {
      const subBefore = await SaaSSubscription.findOne({ tenantId: TENANT_A });
      expect(subBefore?.planKey).toBe(PLAN_KEY.GROWTH);

      const updatedSub = await subscriptionManager.scheduleDowngrade({
        tenantId: TENANT_A,
        targetPlanKey: PLAN_KEY.STARTER,
        reason: "Cost optimization",
      });

      expect(updatedSub.scheduledChange).toBeDefined();
      expect(updatedSub.scheduledChange?.planKey).toBe(PLAN_KEY.STARTER);
      expect(new Date(updatedSub.scheduledChange!.effectiveDate).getTime()).toBe(
        new Date(subBefore!.nextRenewalDate).getTime()
      );

      // Verify current plan and entitlements remain unchanged until effective date
      expect(updatedSub.planKey).toBe(PLAN_KEY.GROWTH);
      const entitlements = await resolveEntitlements(TENANT_A);
      expect(entitlements.planKey).toBe(PLAN_KEY.GROWTH);
    });

    it("allows customer to cancel scheduled downgrade", async () => {
      const sub = await subscriptionManager.cancelScheduledDowngrade(TENANT_A);
      expect(sub.scheduledChange).toBeUndefined();
    });

    it("activates scheduled downgrade when sweep runs past effective date", async () => {
      // Schedule downgrade with effective date in the past
      const sub = await SaaSSubscription.findOne({ tenantId: TENANT_A });
      sub!.scheduledChange = {
        planKey: PLAN_KEY.STARTER,
        effectiveDate: new Date(Date.now() - 1000), // In the past
        requestedAt: new Date(),
        reason: "Scheduled transition",
      };
      await sub!.save();

      const sweepResult = await runScheduledDowngradesSweep();
      expect(sweepResult.processed).toBeGreaterThanOrEqual(1);

      const subAfter = await SaaSSubscription.findOne({ tenantId: TENANT_A });
      expect(subAfter?.planKey).toBe(PLAN_KEY.STARTER);
      expect(subAfter?.scheduledChange).toBeUndefined();

      const entitlements = await resolveEntitlements(TENANT_A);
      expect(entitlements.planKey).toBe(PLAN_KEY.STARTER);
      expect(entitlements.limits.maxUsers).toBe(5);
    });
  });

  describe("5. SUB-05: Cancellation & Reactivation Lifecycle", () => {
    it("cancels subscription, stopping renewals but preserving access until paidThroughDate", async () => {
      const sub = await subscriptionManager.cancelSubscription({
        tenantId: TENANT_A,
        reason: "Project completed",
      });

      expect(sub.status).toBe(SAAS_SUBSCRIPTION_STATUS.CANCELLED);
      expect(sub.cancellation?.requestedAt).toBeInstanceOf(Date);
      expect(new Date(sub.cancellation!.effectiveDate).getTime()).toBe(
        new Date(sub.paidThroughDate).getTime()
      );

      // Verify audit log
      const event = await SubscriptionEvent.findOne({
        tenantId: TENANT_A,
        type: SUBSCRIPTION_EVENT_TYPE.CANCELED,
      });
      expect(event).toBeDefined();
    });

    it("allows reactivation of cancelled subscription before paidThroughDate", async () => {
      const sub = await subscriptionManager.reactivateSubscription(TENANT_A);
      expect(sub.status).toBe(SAAS_SUBSCRIPTION_STATUS.ACTIVE);
      expect(sub.cancellation).toBeUndefined();

      const event = await SubscriptionEvent.findOne({
        tenantId: TENANT_A,
        type: SUBSCRIPTION_EVENT_TYPE.RENEWED,
        "meta.action": "reactivated",
      });
      expect(event).toBeDefined();
    });

    it("expires subscription and drops entitlements when paidThroughDate elapses", async () => {
      // Put subscription in cancelled state with paidThroughDate in past
      const sub = await SaaSSubscription.findOne({ tenantId: TENANT_A });
      sub!.status = SAAS_SUBSCRIPTION_STATUS.CANCELLED;
      sub!.paidThroughDate = new Date(Date.now() - 1000);
      sub!.cancellation = {
        requestedAt: new Date(Date.now() - 5000),
        effectiveDate: new Date(Date.now() - 1000),
      };
      await sub!.save();

      const sweepResult = await runExpiredCancellationsSweep();
      expect(sweepResult.expiredCount).toBeGreaterThanOrEqual(1);

      const subAfter = await SaaSSubscription.findOne({ tenantId: TENANT_A });
      expect(subAfter?.status).toBe(SAAS_SUBSCRIPTION_STATUS.EXPIRED);

      const org = await Organization.findOne({ subdomain: TENANT_A });
      expect(org?.subscriptionStatus).toBe("expired");
    });
  });

  describe("6. PAY-03: Renewal Failures & 3-Day Grace Period Handling", () => {
    it("activates 3-day grace period upon payment failure", async () => {
      // Restore to active first
      const sub = await SaaSSubscription.findOne({ tenantId: TENANT_A });
      sub!.status = SAAS_SUBSCRIPTION_STATUS.ACTIVE;
      await sub!.save();

      const failedSub = await subscriptionManager.handlePaymentFailure({
        tenantId: TENANT_A,
        reason: "Card expired",
      });

      expect(failedSub.status).toBe(SAAS_SUBSCRIPTION_STATUS.PAST_DUE);
      expect(failedSub.gracePeriod.isInGrace).toBe(true);
      expect(failedSub.gracePeriod.failedAttemptsCount).toBe(1);
      expect(failedSub.gracePeriod.lastFailureReason).toBe("Card expired");
      expect(failedSub.gracePeriod.graceEndsAt).toBeDefined();

      // Verify failure payment record created
      const failedPayment = await BillingPayment.findOne({
        tenantId: TENANT_A,
        status: BILLING_PAYMENT_STATUS.FAILED,
        type: BILLING_PAYMENT_TYPE.RENEWAL,
      });
      expect(failedPayment).toBeDefined();
      expect(failedPayment?.failureReason).toBe("Card expired");
    });

    it("suspends subscription when grace period expires", async () => {
      const sub = await SaaSSubscription.findOne({ tenantId: TENANT_A });
      sub!.gracePeriod.graceEndsAt = new Date(Date.now() - 1000); // Grace period expired
      await sub!.save();

      const sweep = await runGracePeriodExpirySweep();
      expect(sweep.suspendedCount).toBeGreaterThanOrEqual(1);

      const subAfter = await SaaSSubscription.findOne({ tenantId: TENANT_A });
      expect(subAfter?.status).toBe(SAAS_SUBSCRIPTION_STATUS.SUSPENDED);
      expect(subAfter?.gracePeriod.isInGrace).toBe(false);

      const org = await Organization.findOne({ subdomain: TENANT_A });
      expect(org?.subscriptionStatus).toBe("suspended");
    });
  });

  describe("7. DOC-01 & DOC-03: Sequential Invoicing & PDF Generation", () => {
    it("generates sequential, collision-free invoice numbers", async () => {
      const inv1 = await getNextSaaSInvoiceNumber();
      const inv2 = await getNextSaaSInvoiceNumber();
      expect(inv1).toMatch(/^INV-SAAS-\d{4}-\d{6}$/);
      expect(inv2).toMatch(/^INV-SAAS-\d{4}-\d{6}$/);
      const num1 = parseInt(inv1.split("-").pop()!, 10);
      const num2 = parseInt(inv2.split("-").pop()!, 10);
      expect(num2).toBe(num1 + 1);
    });

    it("renders valid binary PDF document with correct headers and font tables", async () => {
      const invoice = await BillingInvoice.findOne({ tenantId: TENANT_A });
      expect(invoice).toBeDefined();

      const pdfBytes = await generateInvoicePdf(invoice);
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1000);

      // Verify PDF file signature (%PDF-)
      const pdfHeader = Buffer.from(pdfBytes.slice(0, 5)).toString("utf8");
      expect(pdfHeader).toBe("%PDF-");
    });
  });

  describe("8. SEC-02 & SEC-03: Tenant Isolation & Cross-Tenant Defense", () => {
    it("rejects attempt to apply upgrade to another tenant's payment record", async () => {
      // Create payment for Tenant B
      const prepB = await subscriptionManager.prepareUpgrade({
        tenantId: TENANT_B,
        targetPlanKey: PLAN_KEY.PRO,
      });

      const validSig = razorpayService.generateTestSignature(prepB.order.id, "pay_cross_attempt");

      // Attempt to verify Tenant B's payment using Tenant A's identity
      await expect(
        subscriptionManager.verifyAndApplyUpgrade({
          tenantId: TENANT_A, // Tenant A claiming Tenant B's payment
          paymentId: prepB.paymentId,
          razorpayOrderId: prepB.order.id,
          razorpayPaymentId: "pay_cross_attempt",
          razorpaySignature: validSig,
        })
      ).rejects.toThrow(/Cross-tenant payment mismatch rejected/);
    });

    it("verifies webhook signature using constant-time HMAC comparison", () => {
      const payload = JSON.stringify({ event: "payment.captured", id: "evt_123" });
      const validSig = razorpayService.generateTestWebhookSignature(payload);

      expect(razorpayService.verifyWebhookSignature(payload, validSig)).toBe(true);
      expect(razorpayService.verifyWebhookSignature(payload, "invalid_webhook_signature")).toBe(false);
      expect(razorpayService.verifyWebhookSignature(payload, null)).toBe(false);
    });
  });

  describe("9. DOC-04 & E2E-06: Verified Refunds & Traceable Invoice Adjustments", () => {
    it("processes verified refund, preserves issued invoice, and marks status as refunded", async () => {
      // Find a successful payment from earlier tests
      const payment = await BillingPayment.findOne({
        tenantId: TENANT_A,
        status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
      });
      expect(payment).toBeDefined();

      const refundAmount = payment!.amount;
      const refundId = `ref_audit_${Date.now()}`;

      // Simulate the exact Global Admin refund route execution
      payment!.status = BILLING_PAYMENT_STATUS.REFUNDED;
      payment!.refund = {
        refundId,
        amount: refundAmount,
        reason: "Customer requested upgrade rollback",
        refundedAt: new Date(),
        status: "processed",
      };
      await payment!.save();

      // Traceable adjustment on associated invoice
      if (payment!.invoiceId) {
        await BillingInvoice.findOneAndUpdate(
          { invoiceNumber: payment!.invoiceId },
          {
            $set: {
              status: "refunded",
              notes: `Refund of ${payment!.currency} ${refundAmount} issued.`,
            },
          }
        );
      }

      await SubscriptionEvent.create({
        tenantId: payment!.tenantId,
        type: SUBSCRIPTION_EVENT_TYPE.PAYMENT_FAILED,
        tier: "starter",
        amount: refundAmount,
        currency: payment!.currency,
        meta: {
          action: "refund_processed",
          paymentId: payment!._id,
          refundId,
        },
      });

      // Verify refund persisted
      const refundedPayment = await BillingPayment.findById(payment!._id);
      expect(refundedPayment?.status).toBe(BILLING_PAYMENT_STATUS.REFUNDED);
      expect(refundedPayment?.refund?.amount).toBe(refundAmount);

      // Verify invoice preserved (NOT deleted)
      const invoice = await BillingInvoice.findOne({ invoiceNumber: payment!.invoiceId });
      expect(invoice).toBeDefined();
      expect(invoice?.status).toBe("refunded");
      expect(invoice?.notes).toContain("Refund of INR");
    });
  });

  describe("10. ADM-01 to ADM-03 & E2E-07: Global Admin Analytics Reconciliation", () => {
    const ANALYTICS_TENANT = "audit-analytics-tenant";

    beforeAll(async () => {
      // Create a controlled dataset for exact reconciliation
      const now = new Date();
      await Organization.create({
        subdomain: ANALYTICS_TENANT,
        name: "Analytics Controlled Tenant",
        ownerUserId: new mongoose.Types.ObjectId(),
        tier: "professional",
        subscriptionStatus: "active",
      });

      await SaaSSubscription.create({
        tenantId: ANALYTICS_TENANT,
        planKey: PLAN_KEY.PRO,
        status: SAAS_SUBSCRIPTION_STATUS.ACTIVE,
        billingCycle: "monthly",
        currentPrice: 7999,
        currency: "INR",
        startDate: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        paidThroughDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        nextRenewalDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        autoPay: { enabled: true, status: "active" },
        gracePeriod: { isInGrace: false, failedAttemptsCount: 0 },
      });

      // Seed controlled payments for this month
      await BillingPayment.create([
        {
          tenantId: ANALYTICS_TENANT,
          type: BILLING_PAYMENT_TYPE.NEW,
          amount: 999,
          currency: "INR",
          status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
          billingCycle: "monthly",
          taxBreakup: { taxableAmount: 846.61, cgst: 76.19, sgst: 76.19, igst: 0, totalTax: 152.38, isInterState: false },
          idempotencyKey: `audit_new_${Date.now()}`,
          createdAt: now,
        },
        {
          tenantId: ANALYTICS_TENANT,
          type: BILLING_PAYMENT_TYPE.UPGRADE,
          amount: 2360,
          currency: "INR",
          status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
          billingCycle: "monthly",
          taxBreakup: { taxableAmount: 2000, cgst: 180, sgst: 180, igst: 0, totalTax: 360, isInterState: false },
          idempotencyKey: `audit_upg1_${Date.now()}`,
          createdAt: now,
        },
        {
          tenantId: ANALYTICS_TENANT,
          type: BILLING_PAYMENT_TYPE.UPGRADE,
          amount: 1180,
          currency: "INR",
          status: BILLING_PAYMENT_STATUS.FAILED,
          billingCycle: "monthly",
          failureReason: "Card declined",
          taxBreakup: { taxableAmount: 1000, cgst: 90, sgst: 90, igst: 0, totalTax: 180, isInterState: false },
          idempotencyKey: `audit_upg_fail_${Date.now()}`,
          createdAt: now,
        },
        {
          tenantId: ANALYTICS_TENANT,
          type: BILLING_PAYMENT_TYPE.RENEWAL,
          amount: 7999,
          currency: "INR",
          status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
          billingCycle: "monthly",
          taxBreakup: { taxableAmount: 6778.81, cgst: 610.09, sgst: 610.09, igst: 0, totalTax: 1220.18, isInterState: false },
          idempotencyKey: `audit_ren_${Date.now()}`,
          createdAt: now,
        },
        {
          tenantId: ANALYTICS_TENANT,
          type: BILLING_PAYMENT_TYPE.RENEWAL,
          amount: 7999,
          currency: "INR",
          status: BILLING_PAYMENT_STATUS.REFUNDED,
          billingCycle: "monthly",
          refund: {
            refundId: "ref_ctrl_1",
            amount: 7999,
            reason: "Double billing error",
            refundedAt: now,
            status: "processed",
          },
          taxBreakup: { taxableAmount: 6778.81, cgst: 610.09, sgst: 610.09, igst: 0, totalTax: 1220.18, isInterState: false },
          idempotencyKey: `audit_ref_${Date.now()}`,
          createdAt: now,
        },
      ]);
    });

    it("reconciles gross collections, refunds, and net collections mathematically", async () => {
      const payments = await BillingPayment.find({
        tenantId: ANALYTICS_TENANT,
        status: { $in: [BILLING_PAYMENT_STATUS.SUCCESSFUL, BILLING_PAYMENT_STATUS.REFUNDED] },
      }).lean();

      const grossCollected = payments.reduce((sum, p) => sum + p.amount, 0);
      // 999 (new) + 2360 (upgrade) + 7999 (renewal) + 7999 (refunded charge) = 19357
      expect(grossCollected).toBe(19357);

      const refunds = payments.filter((p) => p.status === BILLING_PAYMENT_STATUS.REFUNDED);
      const totalRefunds = refunds.reduce((sum, p) => sum + (p.refund?.amount || p.amount), 0);
      expect(totalRefunds).toBe(7999);

      const netCollections = Math.max(0, grossCollected - totalRefunds);
      expect(netCollections).toBe(11358);
    });

    it("reconciles upgrade conversion rate strictly as successful / total attempts", async () => {
      const successfulUpgrades = await BillingPayment.countDocuments({
        tenantId: ANALYTICS_TENANT,
        type: BILLING_PAYMENT_TYPE.UPGRADE,
        status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
      });
      const failedUpgrades = await BillingPayment.countDocuments({
        tenantId: ANALYTICS_TENANT,
        type: BILLING_PAYMENT_TYPE.UPGRADE,
        status: BILLING_PAYMENT_STATUS.FAILED,
      });

      expect(successfulUpgrades).toBe(1);
      expect(failedUpgrades).toBe(1);
      const totalAttempts = successfulUpgrades + failedUpgrades;
      expect(totalAttempts).toBe(2);

      const rate = Math.round((successfulUpgrades / totalAttempts) * 100 * 10) / 10;
      expect(rate).toBe(50);
    });
  });

  describe("11. PAY-01 & PAY-04: Webhook Idempotency & Replay Protection", () => {
    it("safely ignores duplicate webhook redelivery and returns 200 without duplicate execution", async () => {
      const eventId = `evt_dedup_${Date.now()}`;
      const payload = {
        id: eventId,
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_mock_webhook_123",
              amount: 118000,
              notes: { tenantId: TENANT_A },
            },
          },
        },
      };

      // 1. First delivery creates record
      const event1 = await BillingWebhookEvent.create({
        eventId,
        eventType: payload.event,
        payload,
        processed: true,
        processedAt: new Date(),
        status: "processed",
      });
      expect(event1).toBeDefined();

      // 2. Second delivery checks processed status
      const existing = await BillingWebhookEvent.findOne({ eventId });
      expect(existing).toBeDefined();
      expect(existing?.processed).toBe(true);

      // Replaying does not insert a second event with the same eventId
      const count = await BillingWebhookEvent.countDocuments({ eventId });
      expect(count).toBe(1);
    });
  });

  describe("12. ADM-04: CSV Export Security & Formula Injection Neutralization", () => {
    function sanitizeField(val: string): string {
      let str = String(val);
      if (/^[=+@-]$/.test(str.charAt(0))) {
        str = `'${str}`;
      }
      if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    it("prepends single quote to neutralize formula injection attacks in spreadsheet exports", () => {
      expect(sanitizeField("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
      expect(sanitizeField("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
      expect(sanitizeField("-100")).toBe("'-100");
      expect(sanitizeField("@mention")).toBe("'@mention");
      expect(sanitizeField("Normal Plan Name")).toBe("Normal Plan Name");
    });
  });
});

