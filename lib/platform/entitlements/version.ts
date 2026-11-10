/**
 * Entitlement versioning (G4). Every write that can change what a tenant is allowed to use bumps
 * Organization.entitlementVersion. The hooks are installed once on the models (see
 * models/admin/Organization.ts and models/platform/OrganizationEntitlement.ts), so a new mutation
 * path cannot silently bypass them as long as it goes through Mongoose (save / update* /
 * findOneAndUpdate). Raw driver writes and bulkWrite do NOT run Mongoose middleware and must call
 * bumpEntitlementVersion() explicitly.
 */

/** Organization paths whose change alters effective access. */
export const ENTITLEMENT_FIELDS = [
  "tier",
  "subscriptionStatus",
  "trialEndDate",
  "isActive",
  "status",
  "settings.enabledModules",
  "settings.disabledModules",
] as const;

function matches(path: string): boolean {
  return ENTITLEMENT_FIELDS.some((f) => path === f || path.startsWith(`${f}.`) || f.startsWith(`${path}.`));
}

/** True when a Mongoose update document (operators or plain fields) touches an entitlement field. */
export function updateTouchesEntitlement(update: unknown): boolean {
  if (!update || typeof update !== "object") return false;
  if (Array.isArray(update)) return update.length > 0; // aggregation-pipeline update: assume it may
  for (const [key, value] of Object.entries(update as Record<string, unknown>)) {
    if (key === "$inc" && value && typeof value === "object" && Object.keys(value).every((k) => k === "entitlementVersion")) continue;
    if (key.startsWith("$")) {
      if (value && typeof value === "object" && Object.keys(value as object).some(matches)) return true;
    } else if (matches(key)) {
      return true;
    }
  }
  return false;
}

/** Merge `$inc: { entitlementVersion: 1 }` into an update document in place. */
export function withVersionBump<T extends Record<string, any>>(update: T): T {
  if (Array.isArray(update)) return update;
  const u: any = update;
  u.$inc = { ...(u.$inc ?? {}), entitlementVersion: (u.$inc?.entitlementVersion ?? 0) + 1 };
  return u;
}

/** Explicit bump for writes that bypass Mongoose middleware (raw driver / bulkWrite). */
export async function bumpEntitlementVersion(tenantId: string): Promise<void> {
  const Organization = (await import("@/models/admin/Organization")).default;
  await Organization.updateOne({ subdomain: tenantId }, { $inc: { entitlementVersion: 1 } });
}
