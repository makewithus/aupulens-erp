import connectDB from "@/lib/db";
import PlatformAlert from "@/models/platform/PlatformAlert";
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
 * itself, read by the /platform alerts panel). emailSent/webhookSent are
 * NEVER set true anywhere in this codebase — no platform-level email/
 * webhook sending infrastructure exists yet (docs/admin/OPEN_QUESTIONS.md).
 * Never throws back to the caller — same defensive shape as
 * lib/platform/audit/emit.ts.
 */
export async function emitPlatformAlert(input: EmitPlatformAlertInput): Promise<void> {
  try {
    await connectDB();
    await PlatformAlert.create({
      tenantId: input.tenantId,
      alertType: input.alertType,
      severity: input.severity,
      message: input.message,
      deliveryChannels: [PLATFORM_ALERT_DELIVERY_CHANNEL.IN_APP],
      metadata: input.metadata,
    });
  } catch (err) {
    console.error("[platform-alerts] failed to write PlatformAlert", {
      alertType: input.alertType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
