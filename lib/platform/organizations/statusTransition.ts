import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import {
  ADMIN_CAPABILITY,
  ORGANIZATION_STATUS,
  PLATFORM_ALERT_TYPE,
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
import { emitPlatformAlert } from "@/lib/platform/alerts/emit";

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
 *
 * Phase 11 Part 0.3 finding: PAYMENT_HOLD was reachable in
 * ORGANIZATION_STATUS_TRANSITIONS and persisted to `Organization.status`
 * exactly like every other status, but until this fix it was a label that
 * lied — nothing anywhere in the codebase read it, so an organisation moved
 * to PAYMENT_HOLD kept `isActive: true` and its users could log in and
 * transact exactly as before. This codebase has no in-app tenant billing/
 * payment flow (§24's MRR/ARR are DECLARED_NOT_POSSIBLE — nothing charges a
 * tenant for platform access, so there is no "let them log in to pay"
 * scenario to preserve). Given that, and that `isActive` is the only real
 * enforcement point this project has, PAYMENT_HOLD now blocks login the same
 * way SUSPENDED does — Hard Rule 8's "authentication and/or transaction
 * access" is satisfied via the authentication half, consistent with the only
 * existing precedent. Reactivating from SUSPENDED or PAYMENT_HOLD restores
 * `isActive`. See docs/admin/verification/HARD_RULES.md rule 8 for the proof
 * and OPEN_QUESTIONS.md for the adjacent, then-out-of-scope finding this
 * surfaced (CANCELLED/ARCHIVED also never flipped `isActive`).
 *
 * Phase 11 Part 1.6: ARCHIVED added to this same list. Since a delete-
 * organisation feature was deliberately not built (see
 * docs/admin/OPEN_QUESTIONS.md's "delete organisation" entry), archiving is
 * now the documented, supported way to retire an organisation — and an
 * organisation that's supposedly "retired" but whose users can still log in
 * exactly as before is the identical "label that lies" shape PAYMENT_HOLD
 * was. CANCELLED is now the one remaining status that still doesn't block
 * login — a real, adjacent gap, deliberately left out of this pass (this
 * user's own ask was specifically about ARCHIVED's reversibility) and
 * recorded in OPEN_QUESTIONS.md rather than silently expanded into.
 */
const STATUSES_THAT_BLOCK_LOGIN: OrganizationStatus[] = [
  ORGANIZATION_STATUS.SUSPENDED,
  ORGANIZATION_STATUS.PAYMENT_HOLD,
  ORGANIZATION_STATUS.ARCHIVED,
];
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
  if (STATUSES_THAT_BLOCK_LOGIN.includes(toStatus)) {
    organization.isActive = false;
  } else if (STATUSES_THAT_BLOCK_LOGIN.includes(fromStatus) && toStatus === ORGANIZATION_STATUS.ACTIVE) {
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
    severity: STATUSES_THAT_BLOCK_LOGIN.includes(toStatus)
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

  if (toStatus === ORGANIZATION_STATUS.SUSPENDED) {
    await emitPlatformAlert({
      tenantId: subdomain,
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      severity: PLATFORM_SEVERITY.WARNING,
      message: `Organisation "${organization.name}" (${subdomain}) was suspended: ${reason}`,
      metadata: { reason, actorId: actor.id },
    });
  }
}
