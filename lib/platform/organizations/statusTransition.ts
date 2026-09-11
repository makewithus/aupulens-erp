import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import {
  ADMIN_CAPABILITY,
  ORGANIZATION_STATUS,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  SUBSCRIPTION_EVENT_TYPE,
  isValidOrganizationStatusTransition,
  type OrganizationStatus,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export class OrganizationStatusError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "OrganizationStatusError";
  }
}

/**
 * Source doc §33 rule 8: "a status field that changes nothing is worse than
 * no feature." SUSPENDED genuinely blocks login — it flips the pre-existing
 * `Organization.isActive` flag, which auth.ts's authorize() already checks
 * and rejects on (`!org.isActive` → sign-in refused). This reuses the one
 * real, working enforcement point in the codebase rather than inventing a
 * second one. See docs/admin/OPEN_QUESTIONS.md #2.
 */
export async function changeOrganizationStatus(
  actor: AdminActor,
  subdomain: string,
  toStatus: OrganizationStatus,
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.SUSPEND_ORGANIZATION);
  if (!reason || !reason.trim()) {
    throw new OrganizationStatusError("A reason is required for every status change.", 400);
  }

  await connectDB();
  const organization = await Organization.findOne({ subdomain });
  if (!organization) {
    throw new OrganizationStatusError("Organisation not found.", 404);
  }

  const fromStatus = organization.status ?? ORGANIZATION_STATUS.ACTIVE;
  if (!isValidOrganizationStatusTransition(fromStatus, toStatus)) {
    throw new OrganizationStatusError(
      `Cannot transition from ${fromStatus} to ${toStatus}.`,
      409,
    );
  }

  organization.status = toStatus;
  if (toStatus === ORGANIZATION_STATUS.SUSPENDED) {
    organization.isActive = false;
  } else if (fromStatus === ORGANIZATION_STATUS.SUSPENDED && toStatus === ORGANIZATION_STATUS.ACTIVE) {
    organization.isActive = true;
  }
  await organization.save();

  await appendSubscriptionEvent({
    tenantId: subdomain,
    type: SUBSCRIPTION_EVENT_TYPE.STATUS_CHANGED,
    tier: organization.tier,
    meta: { fromStatus, toStatus, reason, actorId: actor.id },
  });

  await emitPlatformAuditEvent({
    actor,
    tenantId: subdomain,
    eventCategory: PLATFORM_EVENT_CATEGORY.ORGANISATION,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_STATUS_CHANGED,
    severity:
      toStatus === ORGANIZATION_STATUS.SUSPENDED
        ? PLATFORM_SEVERITY.WARNING
        : PLATFORM_SEVERITY.INFO,
    entityType: "Organization",
    entityId: String(organization._id),
    oldValue: { status: fromStatus },
    newValue: { status: toStatus },
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
}
