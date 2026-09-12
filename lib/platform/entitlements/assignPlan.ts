import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import {
  ADMIN_CAPABILITY,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  SUBSCRIPTION_EVENT_TYPE,
  type PlanKeyType,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";
import { checkLargeDowngrade } from "@/lib/platform/alerts/conditions";
import { invalidateEntitlementsCache } from "./resolve";

export class AssignPlanError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AssignPlanError";
  }
}

/**
 * Source doc §9/§10: records previous plan, new plan, changed-by, reason,
 * effective date, "immediately" or "next billing cycle" — full history via
 * SubscriptionEvent (Phase 2's own precedent, extended additively with
 * `plan_assigned`), never a separate history table.
 *
 * A plan change NEVER deletes tenant data (Hard Rule 7) — this function only
 * ever writes to Organization (nothing), OrganizationEntitlement (one
 * upsert), and SubscriptionEvent (one append) — it has no code path that
 * touches any tenant business-data collection at all, by construction.
 */
export async function assignPlan(
  actor: AdminActor,
  tenantId: string,
  toPlanKey: PlanKeyType,
  effective: "immediately" | "next_billing_cycle",
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.ASSIGN_PLAN);
  if (!reason || !reason.trim()) {
    throw new AssignPlanError("A reason is required for every plan assignment.", 400);
  }

  await connectDB();
  const organization = await Organization.findOne({ subdomain: tenantId });
  if (!organization) {
    throw new AssignPlanError("Organisation not found.", 404);
  }
  const plan = await Plan.findOne({ key: toPlanKey, active: true });
  if (!plan) {
    throw new AssignPlanError(`Plan "${toPlanKey}" does not exist or is inactive.`, 400);
  }

  const existing = await OrganizationEntitlement.findOne({ tenantId });
  const fromPlanKey = existing?.planKey ?? null;

  const effectiveFrom =
    effective === "immediately"
      ? new Date()
      : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

  await OrganizationEntitlement.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        planKey: toPlanKey,
        assignedAt: new Date(),
        effectiveFrom,
      },
      $unset: { overrides: "" }, // a plan re-assignment clears prior overrides (Custom plans re-apply theirs explicitly)
    },
    { upsert: true },
  );

  invalidateEntitlementsCache(tenantId);

  // Clears the "a plan assignment was attempted at creation and failed"
  // indicator (Phase 9 Addendum C Part 1) on ANY successful assignment,
  // from any source — a no-op write for the vast majority of organisations
  // that never had it set.
  if (organization.planAssignmentPending) {
    organization.planAssignmentPending = false;
    await organization.save();
  }

  await appendSubscriptionEvent({
    tenantId,
    type: SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED,
    tier: organization.tier,
    meta: { fromPlanKey, toPlanKey, effective, reason, actorId: actor.id },
  });

  await checkLargeDowngrade(tenantId, fromPlanKey, toPlanKey);

  await emitPlatformAuditEvent({
    actor,
    tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.SUBSCRIPTION,
    eventType: PLATFORM_EVENT_TYPE.PLAN_ASSIGNED,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "Organization",
    entityId: tenantId,
    oldValue: { planKey: fromPlanKey },
    newValue: { planKey: toPlanKey, effective },
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
}
