import { getTierLimits } from "@/lib/constants/tiers";
import type { OrganizationTier } from "@/lib/constants/statuses";
import { NextResponse } from "next/server";

export interface OrgModuleInfo {
  tier: OrganizationTier | string;
  enabledModules: string[];
}

// Maps route path prefixes to the module name used in TIER_LIMITS.enabledModules.
// Both /api/<module> and /<module> are listed so page routes and API routes
// are treated identically. Order matters — /api/admin must come before /admin
// so the longer prefix matches first.
const MODULE_PATH_MAP: Array<[prefix: string, module: string]> = [
  ["/api/admin",         "admin"],
  ["/admin",             "admin"],
  ["/api/finance",       "finance"],
  ["/finance",           "finance"],
  ["/api/sales",         "sales"],
  ["/sales",             "sales"],
  ["/api/inventory",     "inventory"],
  ["/inventory",         "inventory"],
  ["/api/manufacturing", "manufacturing"],
  ["/manufacturing",     "manufacturing"],
  ["/api/hr",            "hr"],
  ["/hr",                "hr"],
  ["/api/crm",           "crm"],
  ["/crm",               "crm"],
];

// Paths that must NEVER be module-gated regardless of tier.
// Users need auth, billing, and platform routes to remain accessible so they
// can authenticate, view their tier, and upgrade when needed.
export const UNGATED_PREFIXES = [
  "/api/auth",         // NextAuth core + org create/invite/accept (Steps 2–3)
  "/api/billing",      // Billing history — must be visible to trigger upgrades
  "/api/ai/memory",    // Cross-module AI memory
  "/api/internal",     // Middleware-to-server internal calls (e.g. org-tier)
  "/api/tenant",       // Tenant status
  "/api/master-admin", // Role-gated separately — never tier-gated
  "/api/users",        // User management — role-gated separately
  "/auth",             // Login pages
  "/onboarding",       // Signup flow
  "/master-admin",     // Master-admin portal
];

export function getModuleFromPath(pathname: string): string | null {
  for (const [prefix, moduleName] of MODULE_PATH_MAP) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return moduleName;
    }
  }
  return null;
}

export function isPathAllowlisted(pathname: string): boolean {
  return UNGATED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

// Returns true when the module is accessible under BOTH the tier ceiling AND the
// org's own settings (org settings can only narrow, never exceed the tier).
//
// When orgEnabledModules is empty (default for orgs created before Step 5) the
// org check is skipped and only the tier ceiling applies — migration safety.
export function isModuleAccessible(
  moduleName: string,
  tier: OrganizationTier | string | undefined | null,
  orgEnabledModules: string[]
): boolean {
  const { enabledModules: tierModules } = getTierLimits(tier);
  const inTier = (tierModules as readonly string[]).includes(moduleName);
  const inOrg = orgEnabledModules.length === 0 || orgEnabledModules.includes(moduleName);
  return inTier && inOrg;
}

export function buildGateDeniedResponse(
  moduleName: string,
  tier: string
): Record<string, unknown> {
  return {
    error: `The ${moduleName} module is not available on your ${tier} plan`,
    code: "MODULE_NOT_AVAILABLE",
    module: moduleName,
    currentTier: tier,
    requiredAction: "upgrade",
  };
}

// Injected fetcher type — decouples the gating logic from the network/DB call
// so tests can supply a synchronous mock without any HTTP or Mongoose dependency.
export type OrgDataFetcher = (tenantId: string) => Promise<OrgModuleInfo | null>;

// Returns a 403 NextResponse when the module is blocked, or null to allow the
// request to continue. Null is also returned for unauthenticated requests,
// master-admin, allowlisted paths, and non-module paths.
export async function applyModuleGating(
  pathname: string,
  user: { role?: string; tenantId?: string } | null | undefined,
  getOrgData: OrgDataFetcher
): Promise<NextResponse | null> {
  if (!user) return null;

  const tenantId = (user as any).tenantId as string | undefined;
  if (!tenantId) return null;

  // master-admin bypasses module gating — consistent with the existing
  // tenant-isolation bypass in middleware.ts.
  if (user.role === "master-admin") return null;

  // Defence-in-depth: explicit allowlist before path-to-module mapping
  if (isPathAllowlisted(pathname)) return null;

  const moduleName = getModuleFromPath(pathname);
  if (!moduleName) return null; // not a module route

  const orgData = await getOrgData(tenantId);
  // Org lookup failed → fail open; the route handler or DB layer will surface the error.
  if (!orgData) return null;

  if (!isModuleAccessible(moduleName, orgData.tier, orgData.enabledModules)) {
    return NextResponse.json(
      buildGateDeniedResponse(moduleName, orgData.tier ?? "starter"),
      { status: 403 }
    );
  }

  return null; // allowed — caller continues to NextResponse.next()
}
