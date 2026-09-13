import crypto from "crypto";
import connectDB from "@/lib/db";
import PlatformAlert, { IPlatformAlert } from "@/models/platform/PlatformAlert";
import PlatformWebhookConfig from "@/models/platform/PlatformWebhookConfig";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = [250, 750]; // between attempts 1->2 and 2->3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 12 Part 0.2 (source doc §28): webhook delivery, buildable — an HTTP
 * POST to a configured URL with a signed payload. Email is deliberately NOT
 * built here: it needs SMTP credentials this environment does not have.
 * This function IS the adapter interface the brief asked for — wiring a
 * real email provider later means adding a sibling function with the same
 * shape (look up config, attempt delivery, record the result on the alert),
 * never touching `emitPlatformAlert()`'s own call site again.
 *
 * Called fire-and-forget from `emitPlatformAlert()` — retries and delivery
 * never block or fail alert creation itself. Capped at 3 attempts with a
 * short backoff; the final result (delivered or not, and why) is recorded
 * on the SAME PlatformAlert row via `webhookSent` (real now, for the alert
 * types that have a configured, enabled webhook) and `metadata.webhookDeliveryError`.
 */
export async function deliverWebhookForAlert(alertId: string): Promise<void> {
  try {
    await connectDB();
    const alert = await PlatformAlert.findById(alertId);
    if (!alert) return;

    const config = await PlatformWebhookConfig.findOne({ alertType: alert.alertType, enabled: true }).lean();
    if (!config) return; // not configured for this alert type — not an error, just nothing to do

    const payload = buildPayload(alert);
    const signature = crypto.createHmac("sha256", config.secret).update(payload).digest("hex");

    let lastError: string | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Aupulens-Signature": signature },
          body: payload,
        });
        if (res.ok) {
          alert.webhookSent = true;
          await alert.save();
          return;
        }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      if (attempt < MAX_ATTEMPTS - 1) await sleep(RETRY_DELAY_MS[attempt]);
    }

    // Every attempt failed — record why, but never throw. webhookSent stays
    // false (its honest schema default), matching a real, observed failure
    // rather than a fabricated success.
    alert.metadata = { ...(alert.metadata ?? {}), webhookDeliveryError: lastError };
    await alert.save();
  } catch (err) {
    console.error("[platform-alerts] webhook delivery failed unexpectedly", {
      alertId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function buildPayload(alert: IPlatformAlert): string {
  return JSON.stringify({
    id: String(alert._id),
    alertType: alert.alertType,
    severity: alert.severity,
    message: alert.message,
    tenantId: alert.tenantId,
    triggeredAt: alert.triggeredAt,
  });
}
