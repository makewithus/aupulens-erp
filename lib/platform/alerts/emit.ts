import connectDB from "@/lib/db";
import PlatformAlert from "@/models/platform/PlatformAlert";
import PlatformWebhookConfig from "@/models/platform/PlatformWebhookConfig";
import {
  PLATFORM_ALERT_DELIVERY_CHANNEL,
  PlatformAlertType,
  PlatformSeverity,
} from "@/lib/constants/statuses";

export interface EmitPlatformAlertInput {
  tenantId?: string;
  alertType: PlatformAlertType;
  severity: PlatformSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * The single writer for PlatformAlert. In-app delivery is real (the row
 * itself, read by the /platform alerts panel). emailSent is NEVER set true
 * anywhere in this codebase — no platform-level email sending
 * infrastructure exists yet (docs/admin/OPEN_QUESTIONS.md). webhookSent CAN
 * be set true — real, if-configured HTTP delivery via
 * lib/platform/alerts/webhookDelivery.ts (Phase 12 Part 0.2, source doc §28).
 * Never throws back to the caller — same defensive shape as
 * lib/platform/audit/emit.ts.
 */
export async function emitPlatformAlert(input: EmitPlatformAlertInput): Promise<void> {
  try {
    await connectDB();
    const hasWebhook = await PlatformWebhookConfig.exists({ alertType: input.alertType, enabled: true });
    const deliveryChannels = hasWebhook
      ? [PLATFORM_ALERT_DELIVERY_CHANNEL.IN_APP, PLATFORM_ALERT_DELIVERY_CHANNEL.WEBHOOK]
      : [PLATFORM_ALERT_DELIVERY_CHANNEL.IN_APP];
    const alert = await PlatformAlert.create({
      tenantId: input.tenantId,
      alertType: input.alertType,
      severity: input.severity,
      message: input.message,
      deliveryChannels,
      metadata: input.metadata,
    });
    if (hasWebhook) {
      // Fire-and-forget: delivery (with its own retries) must never block or
      // fail alert creation itself — the alert row is the source of truth
      // regardless of whether the receiving webhook is currently reachable.
      import("./webhookDelivery")
        .then((m) => m.deliverWebhookForAlert(String(alert._id)))
        .catch(() => {});
    }
  } catch (err) {
    console.error("[platform-alerts] failed to write PlatformAlert", {
      alertType: input.alertType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
