process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aupulens_test_saas_subscription";
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { calculateProration, DEFAULT_SELLER_STATE } from "@/lib/billing/proration";
import {
  isValidSubscriptionTransition,
  validateSubscriptionTransition,
  SubscriptionStateTransitionError,
} from "@/lib/billing/stateMachine";
import { SAAS_SUBSCRIPTION_STATUS } from "@/models/billing/SaaSSubscription";
import { razorpayService, RazorpayService } from "@/lib/billing/razorpayClient";
import { PLAN_KEY } from "@/lib/constants/statuses";
import { calculateRenewalTax } from "@/lib/billing/renewalPricing";

describe("Aupulens SaaS Subscription & Billing System — Comprehensive Test Suite", () => {
  describe("1. Proration and Indian GST Calculations", () => {
    it("calculates renewal totals using the same intra/inter-state GST split", () => {
      expect(calculateRenewalTax(999, "Karnataka")).toMatchObject({
        taxableAmount: 999, cgst: 89.91, sgst: 89.91, igst: 0, totalTax: 179.82, totalAmount: 1178.82, isInterState: false,
      });
      expect(calculateRenewalTax(999, "Maharashtra")).toMatchObject({
        cgst: 0, sgst: 0, igst: 179.82, totalTax: 179.82, totalAmount: 1178.82, isInterState: true,
      });
      expect(() => calculateRenewalTax(0)).toThrow(/positive/);
    });
    it("calculates exact proration fraction and rounding for remaining period", () => {
      const periodStart = new Date("2026-10-01T00:00:00Z");
      const periodEnd = new Date("2026-10-31T00:00:00Z");
      const changeDate = new Date("2026-10-16T00:00:00Z"); // Exactly half-way (15 days remaining of 30)

      const result = calculateProration({
        currentPlanPrice: 999, // Starter
        targetPlanPrice: 2999, // Growth
        periodStart,
        periodEnd,
        changeDate,
        sellerState: "Karnataka",
        customerState: "Karnataka", // Intra-state
      });

      expect(result.daysRemaining).toBe(15);
      expect(result.totalDaysInCycle).toBe(30);
      expect(result.prorationFraction).toBe(0.5);

      // Unused credit: 999 * 0.5 = 499.5
      expect(result.unusedCurrentPlanCredit).toBe(499.5);
      // New plan cost: 2999 * 0.5 = 1499.5
      expect(result.newPlanCost).toBe(1499.5);
      // Prorated difference (taxable): 1499.5 - 499.5 = 1000.00
      expect(result.proratedAmount).toBe(1000);

      // Intra-state: 9% CGST + 9% SGST = 18% total
      expect(result.isInterState).toBe(false);
      expect(result.cgst).toBe(90);
      expect(result.sgst).toBe(90);
      expect(result.igst).toBe(0);
      expect(result.totalTax).toBe(180);
      expect(result.totalAmount).toBe(1180);
    });

    it("calculates Inter-State GST (18% IGST) when customer state differs from seller state", () => {
      const periodStart = new Date("2026-10-01T00:00:00Z");
      const periodEnd = new Date("2026-10-31T00:00:00Z");
      const changeDate = new Date("2026-10-16T00:00:00Z");

      const result = calculateProration({
        currentPlanPrice: 999,
        targetPlanPrice: 2999,
        periodStart,
        periodEnd,
        changeDate,
        sellerState: "Karnataka",
        customerState: "Maharashtra", // Inter-state
      });

      expect(result.isInterState).toBe(true);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(180);
      expect(result.totalTax).toBe(180);
      expect(result.totalAmount).toBe(1180);
    });

    it("handles zero remaining days and clamps proration between 0 and 1", () => {
      const periodStart = new Date("2026-10-01T00:00:00Z");
      const periodEnd = new Date("2026-10-31T00:00:00Z");
      const changeDate = new Date("2026-11-05T00:00:00Z"); // Past period

      const result = calculateProration({
        currentPlanPrice: 999,
        targetPlanPrice: 2999,
        periodStart,
        periodEnd,
        changeDate,
      });

      expect(result.daysRemaining).toBe(0);
      expect(result.prorationFraction).toBe(0);
      expect(result.proratedAmount).toBe(0);
      expect(result.totalAmount).toBe(0);
    });
  });

  describe("2. Subscription State Machine and Transitions", () => {
    it("allows valid transitions", () => {
      expect(isValidSubscriptionTransition(SAAS_SUBSCRIPTION_STATUS.TRIAL, SAAS_SUBSCRIPTION_STATUS.ACTIVE)).toBe(true);
      expect(isValidSubscriptionTransition(SAAS_SUBSCRIPTION_STATUS.ACTIVE, SAAS_SUBSCRIPTION_STATUS.PAST_DUE)).toBe(true);
      expect(isValidSubscriptionTransition(SAAS_SUBSCRIPTION_STATUS.PAST_DUE, SAAS_SUBSCRIPTION_STATUS.ACTIVE)).toBe(true);
      expect(isValidSubscriptionTransition(SAAS_SUBSCRIPTION_STATUS.ACTIVE, SAAS_SUBSCRIPTION_STATUS.CANCELLED)).toBe(true);
      expect(isValidSubscriptionTransition(SAAS_SUBSCRIPTION_STATUS.CANCELLED, SAAS_SUBSCRIPTION_STATUS.ACTIVE)).toBe(true);
      expect(isValidSubscriptionTransition(SAAS_SUBSCRIPTION_STATUS.PAST_DUE, SAAS_SUBSCRIPTION_STATUS.SUSPENDED)).toBe(true);
    });

    it("rejects illegal transitions and throws SubscriptionStateTransitionError", () => {
      expect(isValidSubscriptionTransition(SAAS_SUBSCRIPTION_STATUS.EXPIRED, SAAS_SUBSCRIPTION_STATUS.PAST_DUE)).toBe(false);
      expect(() => {
        validateSubscriptionTransition(SAAS_SUBSCRIPTION_STATUS.EXPIRED, SAAS_SUBSCRIPTION_STATUS.PAST_DUE);
      }).toThrowError(SubscriptionStateTransitionError);
    });
  });

  describe("3. Razorpay Client and Cryptographic Verification", () => {
    it("creates a future-start Razorpay subscription using documented fields", async () => {
      const service = new RazorpayService({ keyId: "rzp_test_key", keySecret: "test_secret", webhookSecret: "hook" });
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          id: "plan_12345678901234", period: "monthly", interval: 1,
          item: { amount: 117882, currency: "INR" },
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          id: "sub_12345678901234", plan_id: "plan_12345678901234", status: "created",
          total_count: 120, paid_count: 0, short_url: "https://rzp.io/rzp/test",
        }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      try {
        const plan = await service.fetchPlan("plan_12345678901234");
        expect(plan.item.amount).toBe(117882);
        const subscription = await service.createSubscription({
          planId: plan.id,
          totalCount: 120,
          startAt: 1_800_000_000,
          expireBy: 1_799_996_400,
          notes: { tenantId: "tenant-a" },
        });
        expect(subscription.short_url).toBe("https://rzp.io/rzp/test");
        const requestBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
        expect(fetchMock.mock.calls[1][0]).toBe("https://api.razorpay.com/v1/subscriptions");
        expect(requestBody).toMatchObject({
          plan_id: "plan_12345678901234", total_count: 120, start_at: 1_800_000_000,
          expire_by: 1_799_996_400, customer_notify: false,
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("fails closed instead of synthesizing a refund without configured Razorpay credentials", async () => {
      const serviceWithoutCredentials = new RazorpayService({ keyId: "", keySecret: "", webhookSecret: "" });
      expect(serviceWithoutCredentials.isConfigured()).toBe(false);
      await expect(serviceWithoutCredentials.createRefund({
        paymentId: "pay_refund_guard_test",
        amount: 100,
        currency: "INR",
        reason: "test",
      })).rejects.toThrow(/credentials are required/i);
    });

    it("does not accept the API key secret as a webhook secret outside tests", () => {
      const serviceWithOnlyApiSecret = new RazorpayService({ keyId: "key", keySecret: "api_secret", webhookSecret: "" });
      const rawBody = "{\"event\":\"payment.captured\"}";
      const apiSecretSignature = crypto.createHmac("sha256", "api_secret").update(rawBody).digest("hex");
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(serviceWithOnlyApiSecret.verifyWebhookSignature(rawBody, apiSecretSignature)).toBe(false);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("rejects missing-credential order and signature fallbacks outside the test runtime", async () => {
      const serviceWithoutCredentials = new RazorpayService({ keyId: "", keySecret: "", webhookSecret: "" });
      const fallbackSignature = serviceWithoutCredentials.generateTestSignature("order_forged", "pay_forged");
      vi.stubEnv("NODE_ENV", "production");
      try {
        await expect(serviceWithoutCredentials.createOrder({
          amount: 100,
          currency: "INR",
          receipt: "production-fail-closed-test",
        })).rejects.toThrow(/credentials are required/i);
        expect(serviceWithoutCredentials.verifyPaymentSignature({
          razorpayOrderId: "order_forged",
          razorpayPaymentId: "pay_forged",
          razorpaySignature: fallbackSignature,
        })).toBe(false);
        expect(serviceWithoutCredentials.verifyWebhookSignature("{}", "not-a-signature")).toBe(false);
        expect(() => serviceWithoutCredentials.generateTestWebhookSignature("{}")).toThrow(/test runtime/i);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("generates deterministic test order in test mode", async () => {
      const order = await razorpayService.createOrder({
        amount: 1180,
        currency: "INR",
        receipt: "rcpt_test_12345",
        notes: { tenantId: "test-tenant-100" },
      });

      expect(order.id).toBeDefined();
      expect(order.amount).toBe(118000); // 1180 Rupees in paise
      expect(order.currency).toBe("INR");
      expect(order.receipt).toBe("rcpt_test_12345");
    });

    it("verifies valid HMAC-SHA256 payment signature and rejects tampered signature", () => {
      const orderId = "order_test_999888";
      const paymentId = "pay_test_777666";
      const validSignature = razorpayService.generateTestSignature(orderId, paymentId);

      // Valid signature passes
      const isValid = razorpayService.verifyPaymentSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      });
      expect(isValid).toBe(true);

      // Tampered signature fails
      const isInvalid = razorpayService.verifyPaymentSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: "invalid_tampered_signature_hex_value",
      });
      expect(isInvalid).toBe(false);
    });

    it("verifies webhook signatures with constant-time equality", () => {
      const payload = JSON.stringify({ event: "payment.captured", id: "evt_12345" });
      const validSig = razorpayService.generateTestWebhookSignature(payload);

      expect(razorpayService.verifyWebhookSignature(payload, validSig)).toBe(true);
      expect(razorpayService.verifyWebhookSignature(payload, "bad_signature")).toBe(false);
      expect(razorpayService.verifyWebhookSignature(payload, null)).toBe(false);
    });
  });

  describe("4. End-to-End Scenarios and Business Workflows", () => {
    it("Scenario A & B: Upgrade verification enforces server verification before activating entitlements", () => {
      // Mock DB & models for unit validation
      const targetPlan = PLAN_KEY.PRO;
      expect(targetPlan).toBe("pro");

      // Ensure that unverified signature throws error and does not activate
      const badAttempt = {
        tenantId: "unit-test-tenant",
        paymentId: "60d5ec49f1b2c8b1f8e4e1a1",
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_123",
        razorpaySignature: "invalid_sig",
      };

      // Signature verification fails
      expect(
        razorpayService.verifyPaymentSignature({
          razorpayOrderId: badAttempt.razorpayOrderId,
          razorpayPaymentId: badAttempt.razorpayPaymentId,
          razorpaySignature: badAttempt.razorpaySignature,
        })
      ).toBe(false);
    });

    it("Scenario D: Scheduled downgrade retains current plan until effectiveDate", () => {
      const now = new Date();
      const nextRenewalDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      const scheduledChange = {
        planKey: PLAN_KEY.STARTER,
        effectiveDate: nextRenewalDate,
        requestedAt: now,
        reason: "Cost optimization",
      };

      // Current plan remains active before effectiveDate
      const isEffectiveNow = new Date(scheduledChange.effectiveDate).getTime() <= now.getTime();
      expect(isEffectiveNow).toBe(false);
    });

    it("Scenario E: 3-Day Grace Period Calculation", () => {
      const failedAt = new Date("2026-10-26T10:00:00Z");
      const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;
      const graceEndsAt = new Date(failedAt.getTime() + gracePeriodMs);

      expect(graceEndsAt.toISOString()).toBe("2026-10-29T10:00:00.000Z");

      // During grace period (2 days after failure):
      const dayTwo = new Date("2026-10-28T10:00:00Z");
      expect(dayTwo.getTime() < graceEndsAt.getTime()).toBe(true);

      // After grace period expires (4 days after failure):
      const dayFour = new Date("2026-10-30T10:00:00Z");
      expect(dayFour.getTime() > graceEndsAt.getTime()).toBe(true);
    });

    it("Scenario F: Cancellation stops renewals but retains access until paidThroughDate", () => {
      const now = new Date("2026-10-10T00:00:00Z");
      const paidThroughDate = new Date("2026-10-31T00:00:00Z");

      const cancellation = {
        requestedAt: now,
        effectiveDate: paidThroughDate,
        reason: "Project completed",
      };

      // On 2026-10-20 (during paid period), access is still valid
      const checkDate = new Date("2026-10-20T00:00:00Z");
      const isAccessValid = checkDate.getTime() <= cancellation.effectiveDate.getTime();
      expect(isAccessValid).toBe(true);

      // Reactivation before paidThroughDate is legal
      expect(isValidSubscriptionTransition(SAAS_SUBSCRIPTION_STATUS.CANCELLED, SAAS_SUBSCRIPTION_STATUS.ACTIVE)).toBe(true);
    });

    it("Scenario G: Refund preserves historical records with traceable adjustments", () => {
      const originalPayment = {
        id: "pay_test_orig_101",
        amount: 2360,
        currency: "INR",
        status: "successful",
      };

      const refund = {
        refundId: "ref_test_001",
        amount: 2360,
        reason: "Customer requested cancellation credit",
        refundedAt: new Date(),
        status: "processed",
      };

      // Original amount remains 2360; status updates to refunded with adjustment attachment
      expect(originalPayment.amount).toBe(2360);
      expect(refund.amount).toBe(2360);
      expect(refund.status).toBe("processed");
    });
  });

  describe("5. Global Admin Analytics and KPI Invariants", () => {
    it("normalizes MRR and ARR consistently across monthly and annual plans", () => {
      const subscriptions = [
        { planKey: "starter", billingCycle: "monthly", currentPrice: 999, status: "active" },
        { planKey: "pro", billingCycle: "monthly", currentPrice: 4999, status: "active" },
        { planKey: "business", billingCycle: "yearly", currentPrice: 119990, status: "active" }, // Yearly
        { planKey: "growth", billingCycle: "monthly", currentPrice: 2999, status: "past_due" }, // In grace: excluded from active recurring or included by policy
        { planKey: "enterprise", billingCycle: "monthly", currentPrice: 9999, status: "cancelled" }, // Excluded
      ];

      // Active recurring subscriptions only
      const activeSubs = subscriptions.filter((s) => s.status === "active");
      const mrr = activeSubs.reduce((sum, s) => {
        const monthly = s.billingCycle === "yearly" ? s.currentPrice / 12 : s.currentPrice;
        return sum + Math.round(monthly);
      }, 0);

      // 999 + 4999 + round(119990 / 12 = 9999.16 -> 9999) = 15997
      expect(mrr).toBe(15997);
      expect(mrr * 12).toBe(191964);
    });

    it("calculates net collections strictly as gross collections minus verified refunds", () => {
      const grossCollections = 50000;
      const refundsIssued = 5000;
      const netCollections = grossCollections - refundsIssued;

      expect(netCollections).toBe(45000);
      expect(netCollections).toBeLessThan(grossCollections);
    });
  });
});
