import type { OrgModuleInfo } from "@/lib/middleware/moduleGate";

/**
 * Builds the entitlement claims embedded in the JWT. Everything is copied into PLAIN values: a Mongoose
 * array (CoreMongooseArray) or Date cannot be structuredClone'd during Auth.js JWT encoding, which crashes
 * login with `DataCloneError: [object Array] could not be cloned` (see the same note on `permissions` in auth.ts).
 */
export function buildOrgModuleData(
  org: {
    settings?: { enabledModules?: Iterable<string> | null } | null;
    subscriptionStatus?: string | null;
    trialEndDate?: Date | null;
    isActive?: boolean | null;
  },
  activeTier: string,
  resolvedModules?: Iterable<string> | null,
): OrgModuleInfo {
  return {
    tier: activeTier,
    enabledModules: org.settings?.enabledModules ? [...org.settings.enabledModules] : [],
    subscriptionStatus: org.subscriptionStatus ?? "trial",
    trialEndDate: org.trialEndDate ? new Date(org.trialEndDate).toISOString() : null,
    resolvedModules: resolvedModules ? [...resolvedModules] : undefined,
    isActive: org.isActive !== false,
  };
}
