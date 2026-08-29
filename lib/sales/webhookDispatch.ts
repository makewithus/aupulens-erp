import crypto from "node:crypto";
import SubscriptionWebhook from "@/models/sales/SubscriptionWebhook";

/**
 * Fires an HTTP POST to every active, subscribed webhook for a tenant event.
 * No job/queue infrastructure exists in this codebase (see CLAUDE.md /
 * app/api/cron/crm/*), so this is the "simple async dispatch" the spec
 * explicitly allows as a fallback — each delivery is fire-and-forget (not
 * awaited by callers) so a slow/broken customer endpoint can never block a
 * subscription's own request/cron cycle. Payload is HMAC-SHA256 signed with
 * the webhook's own secret, mirroring the Stripe/GitHub signature-header
 * convention, in the X-Aupulens-Signature header.
 */
export async function dispatchSubscriptionEvent(
  tenantId: string,
  event: string,
  payload: Record<string, any>,
): Promise<void> {
  const webhooks = await SubscriptionWebhook.find({ tenantId, active: true, events: event }).lean();
  if (webhooks.length === 0) return;

  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });

  for (const webhook of webhooks) {
    const signature = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
    fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Aupulens-Signature": signature },
      body,
    }).catch((error) => {
      console.error(`[webhook-dispatch] delivery failed for ${webhook.url} (event=${event}):`, error.message);
    });
  }
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString("hex");
}
