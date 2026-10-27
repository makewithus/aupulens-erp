import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaaSSubscription, { SAAS_SUBSCRIPTION_STATUS } from "@/models/billing/SaaSSubscription";
import { razorpayService } from "@/lib/billing/razorpayClient";
import Organization from "@/models/admin/Organization";
import { calculateRenewalTax } from "@/lib/billing/renewalPricing";
import { requireBillingOperator } from "@/lib/billing/authz";

function configuredPlanIds(): Record<string, string> | null {
  try {
    const value = process.env.RAZORPAY_SUBSCRIPTION_PLAN_IDS_JSON;
    if (!value) return null;
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const subscription = await SaaSSubscription.findOne({ tenantId: session.user.tenantId });
  if (!subscription) return NextResponse.json({ success: false, error: "Subscription not found." }, { status: 404 });
  if (subscription.razorpaySubscriptionId && razorpayService.isConfigured()) {
    try {
      const provider = await razorpayService.fetchSubscription(subscription.razorpaySubscriptionId);
      if (["authenticated", "active", "pending", "halted", "cancelled", "completed", "expired"].includes(provider.status)) {
        subscription.autoPay.enabled = ["authenticated", "active"].includes(provider.status) && !provider.has_scheduled_changes;
        subscription.autoPay.status = subscription.autoPay.enabled ? "active" :
          (["cancelled", "completed", "expired"].includes(provider.status) || provider.has_scheduled_changes) ? "cancelled" : "failed";
        subscription.razorpayCustomerId = provider.customer_id || subscription.razorpayCustomerId;
        await subscription.save();
      }
    } catch {
      return NextResponse.json({ success: false, error: "Provider status could not be verified. Retry shortly." }, { status: 503 });
    }
  }
  return NextResponse.json({ success: true, data: { enabled: subscription.autoPay.enabled, status: subscription.autoPay.status, providerSubscriptionId: subscription.razorpaySubscriptionId } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const forbidden = requireBillingOperator(session.user);
  if (forbidden) return forbidden;
  const body = await req.json().catch(() => ({}));
  if (body.consent !== true) return NextResponse.json({ success: false, error: "Explicit AutoPay consent is required." }, { status: 400 });
  if (!razorpayService.isConfigured()) return NextResponse.json({ success: false, error: "Razorpay is not configured." }, { status: 503 });

  await connectDB();
  const subscription = await SaaSSubscription.findOne({ tenantId: session.user.tenantId });
  if (!subscription || subscription.status !== SAAS_SUBSCRIPTION_STATUS.ACTIVE || subscription.cancellation) {
    return NextResponse.json({ success: false, error: "AutoPay setup requires an active, non-cancelled paid subscription." }, { status: 409 });
  }

  if (subscription.razorpaySubscriptionId) {
    try {
      const provider = await razorpayService.fetchSubscription(subscription.razorpaySubscriptionId);
      if (provider.status === "created" && provider.short_url) {
        return NextResponse.json({ success: true, data: { status: "pending", authorizationUrl: provider.short_url } });
      }
      if (["authenticated", "active"].includes(provider.status)) {
        if (provider.has_scheduled_changes) {
          const restored = await razorpayService.cancelScheduledSubscriptionChanges(provider.id);
          if (restored.has_scheduled_changes) return NextResponse.json({ success: false, error: "AutoPay cancellation is still being reconciled." }, { status: 503 });
        }
        subscription.autoPay.enabled = true;
        subscription.autoPay.status = "active";
        await subscription.save();
        return NextResponse.json({ success: true, data: { status: "active" } });
      }
      if (!["cancelled", "completed", "expired"].includes(provider.status)) {
        return NextResponse.json({ success: false, error: "Existing AutoPay authorization is still being reconciled." }, { status: 409 });
      }
      subscription.razorpaySubscriptionId = undefined;
      subscription.autoPay.mandateId = undefined;
      subscription.autoPay.enabled = false;
      subscription.autoPay.status = "cancelled";
      await subscription.save();
    } catch {
      return NextResponse.json({ success: false, error: "Existing AutoPay authorization could not be verified." }, { status: 503 });
    }
  }

  const planIds = configuredPlanIds();
  const planId = planIds?.[`${subscription.planKey}:${subscription.billingCycle}`];
  const totalCount = Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT);
  if (!planId || !Number.isSafeInteger(totalCount) || totalCount < 1) {
    return NextResponse.json({ success: false, error: "AutoPay is unavailable until a Razorpay plan mapping and approved billing-cycle limit are configured." }, { status: 503 });
  }
  const startAt = Math.floor(new Date(subscription.nextRenewalDate).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(startAt) || startAt <= now + 2 * 60 * 60) {
    return NextResponse.json({ success: false, error: "AutoPay authorization must be set up at least two hours before the next renewal." }, { status: 409 });
  }
  const claim = await SaaSSubscription.findOneAndUpdate(
    { _id: subscription._id, razorpaySubscriptionId: { $exists: false }, "autoPay.status": { $nin: ["pending", "active"] } },
    { $set: { "autoPay.enabled": false, "autoPay.status": "pending" } },
    { new: true }
  );
  if (!claim) return NextResponse.json({ success: false, error: "AutoPay setup is already in progress." }, { status: 409 });

  try {
    const plan = await razorpayService.fetchPlan(planId);
    const org = await Organization.findOne({ subdomain: subscription.tenantId });
    const renewalPrice = calculateRenewalTax(subscription.currentPrice, org?.settings?.state);
    const intervalValid = subscription.billingCycle === "monthly"
      ? plan.period === "monthly" && plan.interval === 1
      : plan.period === "yearly" && plan.interval === 1;
    if (!intervalValid || plan.item.amount !== Math.round(renewalPrice.totalAmount * 100) ||
        plan.item.currency.toUpperCase() !== subscription.currency.toUpperCase()) {
      throw new Error("Configured Razorpay plan does not match the active subscription amount, currency, and cycle.");
    }
    const providerSubscription = await razorpayService.createSubscription({
      planId,
      totalCount,
      startAt,
      expireBy: startAt - 60 * 60,
      notes: { tenantId: subscription.tenantId, billingSubscriptionId: String(subscription._id) },
    });
    subscription.razorpaySubscriptionId = providerSubscription.id;
    subscription.autoPay.mandateId = providerSubscription.id;
    subscription.autoPay.enabled = false;
    subscription.autoPay.status = "pending";
    await subscription.save();
    return NextResponse.json({ success: true, data: { status: "pending", authorizationUrl: providerSubscription.short_url } });
  } catch (error) {
    // An unknown transport outcome remains reserved; retrying creation could
    // create a second provider subscription and authorization request.
    const message = error instanceof Error && error.message.startsWith("Configured Razorpay plan")
      ? error.message
      : "AutoPay setup could not be confirmed. Contact billing support before retrying.";
    if (message.startsWith("Configured Razorpay plan")) {
      await SaaSSubscription.updateOne({ _id: subscription._id }, { $set: { "autoPay.status": "failed" } });
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 202 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const forbidden = requireBillingOperator(session.user);
  if (forbidden) return forbidden;
  await connectDB();
  const subscription = await SaaSSubscription.findOne({ tenantId: session.user.tenantId });
  if (!subscription?.razorpaySubscriptionId) return NextResponse.json({ success: true, data: { status: "not_configured" } });
  if (!razorpayService.isConfigured()) return NextResponse.json({ success: false, error: "Razorpay is not configured." }, { status: 503 });
  try {
    const result = await razorpayService.cancelSubscription(subscription.razorpaySubscriptionId, true);
    subscription.autoPay.enabled = false;
    subscription.autoPay.status = "cancelled";
    await subscription.save();
    return NextResponse.json({ success: true, data: { status: subscription.autoPay.status } });
  } catch {
    return NextResponse.json({ success: false, error: "Provider could not confirm AutoPay cancellation." }, { status: 503 });
  }
}
