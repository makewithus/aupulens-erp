/**
 * Real writer for SubscriptionEvent (Phase 3) — the model's own comment
 * documented this exact helper as the intended write path, but nothing in
 * production code ever called it before this; only test files created
 * SubscriptionEvent documents directly, so GET /api/billing/history always
 * returned an empty list in a live deployment.
 *
 * There is still no real payment gateway wired into this codebase (see
 * lib/sales/paymentGateway.ts — Razorpay/Stripe are Phase 6.7 work), so
 * `payment_succeeded`/`payment_failed`/`renewed` events aren't fired
 * anywhere yet either — only `created` (org signup) and `upgraded`/
 * `downgraded` (master-admin manually changing a tenant's tier, the only
 * real tier-change path that exists today) are wired. Faking a payment
 * event with no real payment behind it would be worse than not having one.
 */
import dbConnect from "@/lib/db";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import { type SubscriptionEventType, type OrganizationTier } from "@/lib/constants/statuses";

export async function appendSubscriptionEvent(params: {
  tenantId: string;
  type: SubscriptionEventType;
  tier: OrganizationTier;
  amount?: number;
  currency?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await dbConnect();
  await SubscriptionEvent.create({
    tenantId: params.tenantId,
    type: params.type,
    tier: params.tier,
    amount: params.amount ?? 0,
    currency: params.currency ?? "USD",
    occurredAt: new Date(),
    meta: params.meta,
  });
}
