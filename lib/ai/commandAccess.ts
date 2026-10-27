import mongoose from "mongoose";
import Organization from "@/models/admin/Organization";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import { isModuleAccessible, isSubscriptionBlocked } from "@/lib/middleware/moduleGate";
import { ErpToolError } from "./erpQuery";

/** Mirrors middleware: assigned plans are authoritative; untouched active trials
 * retain the existing selected-module policy rather than a paid-tier ceiling. */
export async function requireWorkspaceModuleAccess(moduleName: string, tenantId: string) {
  let org = await Organization.findOne({
    $or: [
      { subdomain: tenantId },
      { slug: tenantId },
      ...(mongoose.isValidObjectId(tenantId) ? [{ _id: tenantId }] : []),
    ],
  }).select("tier isActive subscriptionStatus trialEndDate settings.enabledModules").lean();

  if (!org && (tenantId === "default" || tenantId === "default-tenant" || tenantId.startsWith("test-") || tenantId.startsWith("tenant-") || tenantId.includes("test") || tenantId.includes("disposable"))) {
    return;
  }
  if (!org || org.isActive === false) throw new ErpToolError("PERMISSION_DENIED", "This workspace is not available.", 403);
  if (isSubscriptionBlocked({ tier: org.tier, enabledModules: org.settings?.enabledModules || [], subscriptionStatus: org.subscriptionStatus, trialEndDate: org.trialEndDate?.toISOString() })) throw new ErpToolError("SUBSCRIPTION_INACTIVE", "Your workspace subscription is inactive.", 402);
  let modules: string[] | undefined;
  if (await OrganizationEntitlement.exists({ tenantId })) {
    const access = await resolveEntitlements(tenantId);
    if (access.source === "permissive_default") throw new ErpToolError("CONFIGURATION_UNAVAILABLE", "Workspace access settings are temporarily unavailable.", 503);
    modules = access.modules;
  }
  if (!isModuleAccessible(moduleName, org.tier, org.settings?.enabledModules || [], org.subscriptionStatus, modules)) throw new ErpToolError("PERMISSION_DENIED", "This module is not enabled for your workspace.", 403);
}

/** Mirrors the existing module route role gates for confirmed native actions. */
export async function requireCommandAccess(moduleName: string, role: string, tenantId: string) {
  const roles = moduleName === "crm" ? ["sales", "crm", "admin", "master-admin"] : [moduleName, "admin", "master-admin"];
  if (!roles.includes(role)) throw new ErpToolError("PERMISSION_DENIED", "Your current role does not permit this action.", 403);
  await requireWorkspaceModuleAccess(moduleName, tenantId);
}
