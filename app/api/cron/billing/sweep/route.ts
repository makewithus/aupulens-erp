import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  runScheduledDowngradesSweep,
  runGracePeriodExpirySweep,
  runExpiredCancellationsSweep,
  runAutoRenewalSweep,
} from "@/lib/billing/scheduler";
import { processBillingNotificationQueue } from "@/lib/billing/notifications";
import { reconcilePendingRefunds } from "@/lib/billing/refundManager";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET is not configured." },
        { status: 500 }
      );
    }

    const expectedHeader = `Bearer ${cronSecret}`;
    const bufA = Buffer.from(authHeader);
    const bufB = Buffer.from(expectedHeader);

    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized cron invocation." },
        { status: 401 }
      );
    }

    const [downgrades, graceExpiry, cancellations, renewals, notifications, refunds] = await Promise.all([
      runScheduledDowngradesSweep(),
      runGracePeriodExpirySweep(),
      runExpiredCancellationsSweep(),
      runAutoRenewalSweep(),
      processBillingNotificationQueue(),
      reconcilePendingRefunds(),
    ]);

    return NextResponse.json({
      success: true,
      message: "Billing background sweep completed successfully.",
      results: {
        scheduledDowngrades: downgrades,
        gracePeriodExpirations: graceExpiry,
        expiredCancellations: cancellations,
        autoRenewals: renewals,
        notifications,
        refundReconciliation: refunds,
      },
    });
  } catch (error: any) {
    console.error("Billing cron error:", error);
    return NextResponse.json(
      { success: false, error: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}
