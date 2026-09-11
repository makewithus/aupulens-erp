import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import RetentionPolicy from "@/models/platform/RetentionPolicy";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import {
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  PlatformEventCategory,
  PlatformEventType,
} from "@/lib/constants/statuses";
import { emitPlatformAuditEvent } from "./emit";

/** No configuration anywhere → 30 days: the shortest, most conservative
 *  option in source doc §27's own list — never "keep forever" (a
 *  compliance/storage risk) and never "delete immediately" (destroys the
 *  evidence trail before anyone could investigate anything). */
const PLATFORM_DEFAULT_RETENTION_DAYS = 30;

/**
 * Picks the MOST SPECIFIC matching RetentionPolicy row for a given tenant +
 * event — never averages or stacks multiple matching policies. A row's
 * specificity is the count of filter fields it sets (organizationType,
 * country, eventCategory, eventType); any filter field it sets that doesn't
 * match disqualifies the row entirely.
 */
export async function resolveRetentionDays(
  tenantId: string,
  eventCategory: PlatformEventCategory,
  eventType: PlatformEventType,
): Promise<number> {
  await connectDB();
  const [org, policies] = await Promise.all([
    Organization.findOne({ subdomain: tenantId }, { organizationType: 1, "settings.country": 1 }).lean(),
    RetentionPolicy.find({}).lean(),
  ]);

  let best: { retentionDays: number; score: number } | null = null;
  for (const policy of policies) {
    let score = 0;
    if (policy.organizationType) {
      if (policy.organizationType !== org?.organizationType) continue;
      score++;
    }
    if (policy.country) {
      if (policy.country !== org?.settings?.country) continue;
      score++;
    }
    if (policy.eventCategory) {
      if (policy.eventCategory !== eventCategory) continue;
      score++;
    }
    if (policy.eventType) {
      if (policy.eventType !== eventType) continue;
      score++;
    }
    if (!best || score > best.score) {
      best = { retentionDays: policy.retentionDays, score };
    }
  }

  return best?.retentionDays ?? PLATFORM_DEFAULT_RETENTION_DAYS;
}

/**
 * Deletes PlatformAuditLog rows past their resolved retention window.
 * Deletion by retention is ITSELF an audited event (source doc §27) —
 * written BEFORE the delete, so the audit trail records the sweep even in
 * the (unlikely) case the delete itself fails partway through.
 *
 * The `allowRetentionDelete` flag is PlatformAuditLog's one sanctioned
 * deletion escape hatch (built in Phase 1) — this is its only real caller;
 * tests/platform/sourceGrep.test.ts checks that.
 */
export async function runRetentionSweep(): Promise<{ groupsSwept: number; rowsDeleted: number }> {
  await connectDB();

  const groups = await PlatformAuditLog.aggregate([
    { $match: { tenantId: { $exists: true, $ne: null } } },
    { $group: { _id: { tenantId: "$tenantId", eventCategory: "$eventCategory", eventType: "$eventType" } } },
  ]);

  let groupsSwept = 0;
  let rowsDeleted = 0;

  for (const group of groups) {
    const { tenantId, eventCategory, eventType } = group._id as {
      tenantId: string;
      eventCategory: PlatformEventCategory;
      eventType: PlatformEventType;
    };
    const retentionDays = await resolveRetentionDays(tenantId, eventCategory, eventType);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const countToDelete = await PlatformAuditLog.countDocuments({
      tenantId,
      eventCategory,
      eventType,
      createdAt: { $lt: cutoff },
    });
    if (countToDelete === 0) continue;

    await emitPlatformAuditEvent({
      actor: { id: "system", role: "system" },
      tenantId,
      eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
      eventType: PLATFORM_EVENT_TYPE.RETENTION_DELETION_EXECUTED,
      severity: PLATFORM_SEVERITY.INFO,
      metadata: { deletedEventCategory: eventCategory, deletedEventType: eventType, retentionDays, count: countToDelete, cutoff: cutoff.toISOString() },
    });

    await PlatformAuditLog.deleteMany({
      tenantId,
      eventCategory,
      eventType,
      createdAt: { $lt: cutoff },
    }).setOptions({ allowRetentionDelete: true });

    groupsSwept++;
    rowsDeleted += countToDelete;
  }

  return { groupsSwept, rowsDeleted };
}
