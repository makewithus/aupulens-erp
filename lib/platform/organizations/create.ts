import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import OrganizationType from "@/models/platform/OrganizationType";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import { getCountryInfo } from "@/lib/constants/countries";
import {
  ADMIN_CAPABILITY,
  ENTITY_STATUS,
  ORGANIZATION_STATUS,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  SUBSCRIPTION_EVENT_TYPE,
  type OrganizationTypeKey,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export interface CreateOrganizationInput {
  name: string;
  subdomain: string;
  organizationType: OrganizationTypeKey;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerPassword: string;
  country?: string;
  state?: string;
  region?: string;
  industry?: string;
}

export class OrganizationCreateError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "OrganizationCreateError";
  }
}

function isValidTenantSlug(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(value);
}

/**
 * The fourth, admin-actor-aware organisation creation path (source doc §5).
 * Deliberately not a call into app/api/auth/register — that route is
 * unauthenticated-by-design (public self-service signup) and not an
 * admin-actor-aware entry point (docs/admin/SYSTEM_INVENTORY_DELTA.md §2).
 * Reuses the same underlying seeders that route uses, directly.
 */
export async function createOrganization(
  actor: AdminActor,
  input: CreateOrganizationInput,
): Promise<{ organizationId: string; subdomain: string }> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_ORGANIZATIONS);
  await connectDB();

  const subdomain = input.subdomain.trim().toLowerCase();
  if (!isValidTenantSlug(subdomain)) {
    throw new OrganizationCreateError("Subdomain must be a valid DNS-safe slug.", 400);
  }
  if (await Organization.findOne({ subdomain })) {
    throw new OrganizationCreateError("This subdomain is already in use.", 409);
  }
  if (!input.ownerEmail || !/^\S+@\S+\.\S+$/.test(input.ownerEmail)) {
    throw new OrganizationCreateError("A valid owner email is required.", 400);
  }
  if (!input.ownerPassword || input.ownerPassword.length < 8) {
    throw new OrganizationCreateError("Owner password must be at least 8 characters.", 400);
  }

  const orgType = await OrganizationType.findOne({ type: input.organizationType }).lean();
  const countryInfo = getCountryInfo(input.country || "India");
  const temporaryOwnerUserId = new Types.ObjectId();

  const organization = await Organization.create({
    name: input.name,
    subdomain,
    ownerUserId: temporaryOwnerUserId,
    status: ORGANIZATION_STATUS.ONBOARDING,
    organizationType: input.organizationType,
    region: input.region,
    maxUsers: orgType?.defaultConfig.maxUsers,
    aiCallsPerMonth: orgType?.defaultConfig.aiCallsPerMonth,
    settings: {
      themeColor: "#3b82f6",
      timezone: countryInfo.timezone,
      currency: countryInfo.currencyCode,
      country: input.country || "India",
      state: input.state || "",
      industry: input.industry || "",
      enabledModules: orgType?.defaultConfig.enabledModules ?? [],
    },
  });

  const hashedPassword = await bcrypt.hash(input.ownerPassword, 12);
  const ownerUser = await User.create({
    name: input.ownerName,
    email: input.ownerEmail.toLowerCase().trim(),
    phone: input.ownerPhone,
    password: hashedPassword,
    role: "admin",
    status: ENTITY_STATUS.ACTIVE,
    tenantId: subdomain,
  });

  organization.ownerUserId = ownerUser._id as Types.ObjectId;
  await organization.save();

  // Best-effort, matching the existing public-registration precedent — a
  // COA-seed failure must not fail organisation creation, but must not be
  // silently swallowed either (source doc §33: honest failure over a
  // fabricated success).
  let coaSeeded = true;
  try {
    const { seedChartOfAccounts } = await import("@/lib/accounting/coa-seeder");
    const { seedNewChartOfAccounts } = await import("@/lib/accounting/coa-feature-seeder");
    await seedChartOfAccounts(subdomain, String(ownerUser._id));
    await seedNewChartOfAccounts(subdomain, String(ownerUser._id));
  } catch (err) {
    coaSeeded = false;
    console.error("[platform organizations] COA seeding failed for", subdomain, err);
  }

  await appendSubscriptionEvent({
    tenantId: subdomain,
    type: SUBSCRIPTION_EVENT_TYPE.CREATED,
    tier: organization.tier,
  });

  await emitPlatformAuditEvent({
    actor,
    tenantId: subdomain,
    eventCategory: PLATFORM_EVENT_CATEGORY.ORGANISATION,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_CREATED,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "Organization",
    entityId: String(organization._id),
    newValue: {
      name: organization.name,
      subdomain,
      organizationType: input.organizationType,
      status: ORGANIZATION_STATUS.ONBOARDING,
    },
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { coaSeeded },
  });

  return { organizationId: String(organization._id), subdomain };
}
