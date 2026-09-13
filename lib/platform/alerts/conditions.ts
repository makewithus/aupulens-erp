import connectDB from "@/lib/db";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import PlatformAlert from "@/models/platform/PlatformAlert";
import PlatformAlertConfig, { IPlatformAlertConfig } from "@/models/platform/PlatformAlertConfig";
import AiUsageDaily from "@/models/platform/AiUsageDaily";
import {
  PLATFORM_ALERT_TYPE,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  PLAN_KEY,
  PlanKeyType,
} from "@/lib/constants/statuses";
import { emitPlatformAlert } from "./emit";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";
import { getAiPeriod } from "@/lib/ai/usage";

/**
 * Source doc §28, Phase 9 Addendum C Part 3: "a configurable threshold
 * (never a hardcoded number), a dedupe so a sustained condition raises one
 * alert rather than one per occurrence, and an auto-resolve when the
 * condition clears." One singleton config document (never per-tenant —
 * these are all about admin-actor or platform-wide behaviour, not a
 * tenant's own usage), reused across all 4 conditions here.
 */
export async function getAlertConfig(): Promise<IPlatformAlertConfig> {
  await connectDB();
  const existing = await PlatformAlertConfig.findOne({ singleton: true }).lean();
  if (existing) return existing as unknown as IPlatformAlertConfig;
  // Never throws for an unconfigured platform — falls back to the schema's
  // own defaults without requiring a seed step first, same permissive-
  // default philosophy as lib/platform/entitlements/resolve.ts.
  return new PlatformAlertConfig().toObject() as IPlatformAlertConfig;
}

/** Dedupe: skip raising a new alert if an unresolved one with the same
 *  type + dedupe key already exists — a sustained condition (a login spike
 *  that keeps producing failures) raises exactly one alert, not one per
 *  occurrence, until it's resolved. */
async function hasUnresolvedAlert(alertType: string, dedupeKey: string): Promise<boolean> {
  const existing = await PlatformAlert.findOne({
    alertType,
    resolvedAt: { $exists: false },
    "metadata.dedupeKey": dedupeKey,
  }).lean();
  return Boolean(existing);
}

/** Auto-resolve: called once the condition that raised an alert is no
 *  longer true. Idempotent — resolving an already-resolved or nonexistent
 *  alert is a no-op. */
export async function resolveAlertsForKey(alertType: string, dedupeKey: string): Promise<void> {
  await connectDB();
  await PlatformAlert.updateMany(
    { alertType, resolvedAt: { $exists: false }, "metadata.dedupeKey": dedupeKey },
    { $set: { resolvedAt: new Date() } },
  );
}

/**
 * Condition 1: multiple failed admin logins. `app/api/platform/auth/login/
 * route.ts` already maintains a REAL per-admin `failedLoginCount` counter
 * (used for its own lockout mechanism) — this reuses that exact counter
 * rather than re-deriving one from audit-log rows, so the alert and the
 * lockout can never disagree about how many failures actually occurred.
 * Called with the post-increment count, right after `admin.save()`.
 */
export async function checkFailedLoginSpike(email: string, failedLoginCount: number): Promise<void> {
  await connectDB();
  const config = await getAlertConfig();
  const dedupeKey = `failed-login:${email}`;

  if (failedLoginCount >= config.failedLoginThreshold) {
    if (await hasUnresolvedAlert(PLATFORM_ALERT_TYPE.FAILED_LOGIN_SPIKE, dedupeKey)) return;
    await emitPlatformAlert({
      alertType: PLATFORM_ALERT_TYPE.FAILED_LOGIN_SPIKE,
      severity: PLATFORM_SEVERITY.SECURITY,
      message: `${failedLoginCount} consecutive failed login attempts for "${email}".`,
      metadata: { dedupeKey, email, failedLoginCount },
    });
  } else {
    // A successful login resets failedLoginCount to 0 before this is next
    // called — clears any standing alert for this admin once they're back in.
    await resolveAlertsForKey(PLATFORM_ALERT_TYPE.FAILED_LOGIN_SPIKE, dedupeKey);
  }
}

/**
 * Condition 2: repeated permission (capability) failures, per actor.
 * lib/platform/auth/adminRbac.ts::requireCapability() now audits every
 * denial as CAPABILITY_DENIED (Addendum C Part 3) — this is the first real
 * consumer of that data, not a second detection mechanism.
 */
export async function checkPermissionFailureSpike(actorId: string): Promise<void> {
  if (actorId === "unknown") return; // nothing to key a per-actor alert on
  await connectDB();
  const config = await getAlertConfig();
  const windowStart = new Date(Date.now() - config.permissionFailureWindowMinutes * 60 * 1000);

  const count = await PlatformAuditLog.countDocuments({
    eventType: PLATFORM_EVENT_TYPE.CAPABILITY_DENIED,
    actorId,
    createdAt: { $gte: windowStart },
  });

  const dedupeKey = `permission-failure:${actorId}`;
  if (count >= config.permissionFailureThreshold) {
    if (await hasUnresolvedAlert(PLATFORM_ALERT_TYPE.PERMISSION_FAILURE_SPIKE, dedupeKey)) return;
    await emitPlatformAlert({
      alertType: PLATFORM_ALERT_TYPE.PERMISSION_FAILURE_SPIKE,
      severity: PLATFORM_SEVERITY.SECURITY,
      message: `${count} permission denials for admin actor ${actorId} in the last ${config.permissionFailureWindowMinutes} minutes.`,
      metadata: { dedupeKey, actorId, count, windowMinutes: config.permissionFailureWindowMinutes },
    });
  }
}

export const PLAN_RANK: Record<string, number> = {
  [PLAN_KEY.FREE]: 0,
  [PLAN_KEY.STARTER]: 1,
  [PLAN_KEY.GROWTH]: 2,
  [PLAN_KEY.PRO]: 3,
  [PLAN_KEY.BUSINESS]: 4,
  [PLAN_KEY.ENTERPRISE]: 5,
  // CUSTOM is a bespoke deal, not a rung on the standard ladder — a
  // transition to/from it is never treated as a rank-comparable downgrade.
};

/**
 * Condition 3: a large subscription downgrade. Called from assignPlan.ts
 * right after a successful plan change — reuses that real, tested call
 * site rather than polling SubscriptionEvent separately.
 */
export async function checkLargeDowngrade(
  tenantId: string,
  fromPlanKey: PlanKeyType | null,
  toPlanKey: PlanKeyType,
): Promise<void> {
  if (!fromPlanKey || !(fromPlanKey in PLAN_RANK) || !(toPlanKey in PLAN_RANK)) return;
  await connectDB();
  const config = await getAlertConfig();
  const drop = PLAN_RANK[fromPlanKey] - PLAN_RANK[toPlanKey];
  if (drop >= config.largeDowngradeTierDrop) {
    await emitPlatformAlert({
      tenantId,
      alertType: PLATFORM_ALERT_TYPE.LARGE_SUBSCRIPTION_DOWNGRADE,
      severity: PLATFORM_SEVERITY.WARNING,
      message: `Organisation "${tenantId}" downgraded from ${fromPlanKey} to ${toPlanKey} (${drop} tiers).`,
      metadata: { dedupeKey: `large-downgrade:${tenantId}:${Date.now()}`, fromPlanKey, toPlanKey, drop },
    });
  }
}

/**
 * Condition 4: AI cost spike — today's platform-wide cost vs. the trailing
 * average of the preceding N days. Intended to run once daily (a cron), not
 * per-request — see app/api/cron/platform/ai-cost-spike-check/route.ts.
 */
export async function checkAiCostSpike(): Promise<void> {
  await connectDB();
  const config = await getAlertConfig();
  const today = new Date().toISOString().slice(0, 10);

  const [todayRows, trailingRows] = await Promise.all([
    AiUsageDaily.aggregate([
      { $match: { period: today } },
      { $group: { _id: null, cost: { $sum: "$estimatedCostUsd" } } },
    ]),
    AiUsageDaily.aggregate([
      {
        $match: {
          period: {
            $gte: new Date(Date.now() - config.aiCostSpikeTrailingDays * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10),
            $lt: today,
          },
        },
      },
      { $group: { _id: null, cost: { $sum: "$estimatedCostUsd" }, days: { $addToSet: "$period" } } },
    ]),
  ]);

  const todayCost = todayRows[0]?.cost ?? 0;
  const trailingDaysCovered = trailingRows[0]?.days?.length ?? 0;
  if (trailingDaysCovered === 0) return; // not enough history yet to compare against
  const trailingAverage = trailingRows[0].cost / trailingDaysCovered;

  const dedupeKey = `ai-cost-spike:${today}`;
  if (trailingAverage > 0 && todayCost >= trailingAverage * config.aiCostSpikeMultiplier) {
    if (await hasUnresolvedAlert(PLATFORM_ALERT_TYPE.AI_COST_SPIKE, dedupeKey)) return;
    await emitPlatformAlert({
      alertType: PLATFORM_ALERT_TYPE.AI_COST_SPIKE,
      severity: PLATFORM_SEVERITY.WARNING,
      message: `Platform AI cost today ($${todayCost.toFixed(2)}) is ${(todayCost / trailingAverage).toFixed(1)}x the ${config.aiCostSpikeTrailingDays}-day trailing average ($${trailingAverage.toFixed(2)}).`,
      metadata: { dedupeKey, todayCost, trailingAverage, multiplier: config.aiCostSpikeMultiplier },
    });
  }
}

/**
 * Condition 5 (Phase 11 Part 1.7, source doc §28 reclassified from
 * DECLARED_NOT_POSSIBLE to MISSING by Addendum C Part 0.2's audit):
 * `lib/crm/exportEngine.ts` + `app/api/crm/bulk/route.ts` is a real, working
 * CRM bulk export with no audit signal at all. This is that signal — an
 * always-written audit row (actor, tenant, entity type, record count,
 * format) plus a threshold alert, using the same `PlatformAlertConfig`
 * pattern as the other four conditions. Wrapped so it can never throw back
 * into the export itself: a logging/alerting failure must not turn a
 * successful export into a failed one for the tenant.
 *
 * `actorType: "tenant_user"` — this is a TENANT user's own action (CRM
 * export), not an admin actor, so it is recorded distinctly from every
 * other `PlatformAuditLog` row this project writes (which are all
 * `actor: "admin"` or `"system"`). Still lands in the same append-only
 * store, still visible on the organisation's own Audit Logs tab.
 */
export async function recordMassDataExport(input: {
  tenantId: string;
  actorUserId: string;
  entityType: string;
  recordCount: number;
  format: string;
}): Promise<void> {
  try {
    await connectDB();
    const config = await getAlertConfig();

    await emitPlatformAuditEvent({
      actor: { id: input.actorUserId, role: "tenant_user" },
      actorType: "tenant_user",
      tenantId: input.tenantId,
      eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
      eventType: PLATFORM_EVENT_TYPE.MASS_DATA_EXPORT,
      severity: input.recordCount >= config.massExportRecordThreshold ? PLATFORM_SEVERITY.WARNING : PLATFORM_SEVERITY.INFO,
      entityType: input.entityType,
      metadata: { recordCount: input.recordCount, format: input.format },
    });

    if (input.recordCount >= config.massExportRecordThreshold) {
      await emitPlatformAlert({
        tenantId: input.tenantId,
        alertType: PLATFORM_ALERT_TYPE.MASS_DATA_EXPORT,
        severity: PLATFORM_SEVERITY.WARNING,
        message: `Organisation "${input.tenantId}" exported ${input.recordCount} ${input.entityType} record(s) as ${input.format}.`,
        metadata: { dedupeKey: `mass-export:${input.tenantId}:${Date.now()}`, entityType: input.entityType, recordCount: input.recordCount, format: input.format },
      });
    }
  } catch (err) {
    console.error("[platform-alerts] failed to record mass data export", {
      tenantId: input.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
