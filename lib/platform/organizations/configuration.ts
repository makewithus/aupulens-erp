import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import { ADMIN_CAPABILITY, PLATFORM_EVENT_CATEGORY, PLATFORM_EVENT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export class OrganizationConfigurationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "OrganizationConfigurationError";
  }
}

export interface OrganizationConfigurationUpdate {
  country?: string;
  currency?: string;
  timezone?: string;
  taxJurisdiction?: string;
}

/**
 * Phase 11 Part 1.2, Configuration tab write path. Deliberately applies
 * ONLY the fields the caller actually includes — it never re-derives
 * currency/timezone from a changed country the way `create.ts` does at
 * creation time. That auto-derivation is correct exactly once (a brand new
 * organisation has no customisation to protect); doing it again silently on
 * an edit would overwrite an admin's own prior customisation without them
 * asking for it, which is the specific failure mode the brief calls out.
 * The UI is what warns an admin that changing country does not also update
 * currency/timezone — this function's own contract (apply only what's
 * given) is what makes that warning true rather than aspirational.
 */
export async function updateOrganizationConfiguration(
  actor: AdminActor,
  subdomain: string,
  update: OrganizationConfigurationUpdate,
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_ORGANIZATIONS);
  if (!reason || !reason.trim()) {
    throw new OrganizationConfigurationError("A reason is required for every configuration change.", 400);
  }
  if (Object.keys(update).length === 0) {
    throw new OrganizationConfigurationError("No fields were supplied to update.", 400);
  }

  await connectDB();
  const organization = await Organization.findOne({ subdomain });
  if (!organization) {
    throw new OrganizationConfigurationError("Organisation not found.", 404);
  }

  const before = {
    country: organization.settings?.country,
    currency: organization.settings?.currency,
    timezone: organization.settings?.timezone,
    taxJurisdiction: organization.settings?.taxJurisdiction,
  };

  // Object.assign onto the live nested path, not a wholesale reassignment —
  // `organization.settings = { ...organization.settings, ...update }` looks
  // equivalent but isn't: spreading a live Mongoose nested-path object drops
  // its own further-nested sub-objects (settings.ai, settings.branding),
  // which then fail schema validation as `undefined` on save. Found by
  // tests/platform/organizationTabs.test.ts before this ever shipped.
  Object.assign(organization.settings, update);
  organization.markModified("settings");
  await organization.save();

  await emitPlatformAuditEvent({
    actor,
    tenantId: subdomain,
    eventCategory: PLATFORM_EVENT_CATEGORY.ORGANISATION,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_UPDATED,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "Organization",
    entityId: String(organization._id),
    oldValue: before,
    newValue: update,
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason, fieldsChanged: Object.keys(update) },
  });
}
