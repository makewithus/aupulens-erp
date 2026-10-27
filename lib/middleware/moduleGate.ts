import { getTierLimits } from "@/lib/constants/tiers";
import type { OrganizationTier } from "@/lib/constants/statuses";
import { NextResponse } from "next/server";

export interface OrgModuleInfo {
  tier: OrganizationTier | string;
  enabledModules: string[];
  subscriptionStatus?: string;
  trialEndDate?: string | null;
  // Present ONLY when an OrganizationEntitlement row exists for this tenant
  // and resolveEntitlements() resolved it cleanly (source doc §10 / Hard
  // Rule 6 — docs/admin/BRIEF-PHASE-9a-ADDENDUM.md Part 1.2). An admin's
  // deliberate, audited plan assignment then becomes the tier ceiling
  // instead of the legacy hardcoded tiers.ts lookup. Absent for every
  // tenant that has never been touched by the entitlements system — those
  // keep resolving through getTierLimits(tier) exactly as before this
  // field existed. Populated by app/api/internal/org-tier/route.ts, which
  // is the only place with a live Mongoose connection to check for the row.
  resolvedModules?: string[];
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
  ["/api/projects",      "project"],
  ["/projects",          "project"],
];

// Keep admin navigation in sync with the middleware decision. In particular,
// active trials use the org's selected modules instead of the legacy tier
// ceiling, while assigned Central Admin entitlements are authoritative.
export function getAccessibleModules(
  tier: OrganizationTier | string | undefined | null,
  orgEnabledModules: string[],
  subscriptionStatus?: string,
  resolvedModules?: string[],
): string[] {
  const candidates = resolvedModules ?? [
    "admin", "sales", "inventory", "finance", "manufacturing", "hr", "crm", "project",
  ];
  return candidates.filter((moduleName) =>
    isModuleAccessible(moduleName, tier, orgEnabledModules, subscriptionStatus, resolvedModules),
  );
}

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
  "/subscription-inactive", // Trial-expired / subscription-inactive notice page
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

// Returns true when the module is accessible under the current entitlement
// source. For untouched legacy tenants that means BOTH the tier ceiling AND the
// org's own settings (org settings can only narrow, never exceed the tier).
// For tenants with an OrganizationEntitlement row, resolvedModules is the
// authoritative Central Admin decision and must not be narrowed again by stale
// legacy org settings.
//
// When orgEnabledModules is empty (default for orgs created before Step 5) the
// org check is skipped and only the tier ceiling applies — migration safety.
//
// While an untouched legacy org is on an active trial
// (subscriptionStatus === "trial"; an expired trial is already blocked
// earlier), the legacy tier ceiling is bypassed. A tenant with a resolved
// Central Admin entitlement never takes that trial shortcut: its assigned
// module list remains authoritative from the moment it is configured.
export function isModuleAccessible(
  moduleName: string,
  tier: OrganizationTier | string | undefined | null,
  orgEnabledModules: string[],
  subscriptionStatus?: string,
  resolvedModules?: string[]
): boolean {
  if (resolvedModules) {
    return (resolvedModules as readonly string[]).includes(moduleName);
  }

  const inOrg = moduleName === "admin" || orgEnabledModules.length === 0 || orgEnabledModules.includes(moduleName);
  if (subscriptionStatus === "trial") return inOrg;
  // Omitting resolvedModules (the default for every untouched tenant)
  // reproduces the legacy tiers.ts ceiling exactly.
  const tierModules = getTierLimits(tier).enabledModules;
  const inTier = (tierModules as readonly string[]).includes(moduleName);
  return inTier && inOrg;
}

// True when the org's subscription state should block access entirely
// (independent of, and checked before, tier/module gating): an explicitly
// cancelled/suspended subscription, or a trial that has passed its end date
// with no active paid subscription behind it. "active" never blocks, even
// if trialEndDate is set/past (a stale field from before they upgraded).
export function isSubscriptionBlocked(org: OrgModuleInfo): boolean {
  if (org.subscriptionStatus === "suspended" || org.subscriptionStatus === "cancelled") {
    return true;
  }
  if (org.subscriptionStatus === "trial" && org.trialEndDate) {
    return new Date(org.trialEndDate).getTime() < Date.now();
  }
  return false;
}

export function buildGateDeniedResponse(
  moduleName: string,
  tier: string,
  reason: "plan_restricted" | "disabled_by_admin" = "plan_restricted"
): Record<string, unknown> {
  if (reason === "disabled_by_admin") {
    return {
      error: `The ${moduleName} module is entitled on your ${tier} plan but currently disabled by your organization administrator`,
      code: "MODULE_NOT_ENABLED",
      module: moduleName,
      currentTier: tier,
      requiredAction: "enable_in_settings",
    };
  }
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
  getOrgData: OrgDataFetcher,
  isApiRoute: boolean = true,
  requestUrl?: string
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
  // AUP-012: Fail closed if organization lookup fails for non-legacy tenants.
  // Preserves backward compatibility only for "default-tenant" / "default".
  if (!orgData) {
    if (tenantId === "default-tenant" || tenantId === "default") {
      return null; // legacy tenant compatibility
    }
    if (isApiRoute) {
      return NextResponse.json(
        {
          error: "Organization context not found or invalid",
          code: "ORGANIZATION_NOT_FOUND",
        },
        { status: 403 },
      );
    }
    if (requestUrl) {
      const url = new URL("/unauthorized", requestUrl);
      url.searchParams.set("reason", "invalid_organization");
      return NextResponse.redirect(url);
    }
    return NextResponse.json(
      {
        error: "Organization context not found or invalid",
        code: "ORGANIZATION_NOT_FOUND",
      },
      { status: 403 },
    );
  }

  if (
    !isModuleAccessible(
      moduleName,
      orgData.tier,
      orgData.enabledModules,
      orgData.subscriptionStatus,
      orgData.resolvedModules,
    )
  ) {
    const tier = (orgData.tier as string) ?? "starter";
    const tierModules = getTierLimits(tier).enabledModules;
    const inTier =
      (tierModules as readonly string[]).includes(moduleName) ||
      ((orgData.resolvedModules as readonly string[] | undefined)?.includes(moduleName) ?? false);
    const reason =
      inTier && (
        (orgData.resolvedModules !== undefined && !orgData.resolvedModules.includes(moduleName)) ||
        (orgData.enabledModules?.length > 0 && !orgData.enabledModules.includes(moduleName))
      )
        ? "disabled_by_admin"
        : "plan_restricted";

    const errorBody = buildGateDeniedResponse(moduleName, tier, reason);
    if (!isApiRoute && requestUrl) {
      const url = new URL("/unauthorized", requestUrl);
      url.searchParams.set("module", errorBody.module as string);
      url.searchParams.set("tier", errorBody.currentTier as string);
      url.searchParams.set("reason", reason);
      return NextResponse.redirect(url);
    }
    return NextResponse.json(errorBody, { status: 403 });
  }

  return null; // allowed — caller continues to NextResponse.next()
}
