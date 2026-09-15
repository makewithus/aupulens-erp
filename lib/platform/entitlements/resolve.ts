import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import Plan, { IPlanFeatures } from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { ORGANIZATION_TIER, PLAN_KEY, PlanKeyType, PLATFORM_EVENT_CATEGORY, PLATFORM_EVENT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

/**
 * The single source of truth for "what does this tenant get" (source doc
 * §10 / Hard Rule 6). Every entitlement-aware check — Phase 3b's tenant-route
 * enforcement, dashboards, anything — calls this, never a hardcoded
 * `if (plan === ...)`. Cached in-process; invalidated by assignPlan().
 */
export interface ResolvedEntitlements {
  planKey: PlanKeyType;
  modules: string[];
  limits: Omit<IPlanFeatures, "modules" | "featureFlags">;
  featureFlags: Record<string, boolean>;
  source: "assigned" | "tier_fallback" | "permissive_default";
}

interface CacheEntry {
  value: ResolvedEntitlements;
  expiresAt: number;
}
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export function invalidateEntitlementsCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/** Bridges a pre-existing Organization.tier value (starter/professional/
 *  enterprise — see lib/constants/tiers.ts) to a new PLAN_KEY for tenants
 *  that predate this model and have no OrganizationEntitlement row yet. Not
 *  a guess: a documented, deliberate mapping, real for every tenant created
 *  before Phase 3a shipped. */
export function bridgeTierToPlanKey(tier: string | undefined): PlanKeyType {
  switch (tier) {
    case ORGANIZATION_TIER.PROFESSIONAL:
      return PLAN_KEY.PRO;
    case ORGANIZATION_TIER.ENTERPRISE:
      return PLAN_KEY.ENTERPRISE;
    case ORGANIZATION_TIER.STARTER:
    default:
      return PLAN_KEY.STARTER;
  }
}

/** The reverse of `bridgeTierToPlanKey` — which legacy `Organization.tier`
 *  value (if any) resolves to a given plan key for a tenant with no
 *  `OrganizationEntitlement` row. Used only to show an admin how many
 *  *implicitly* bridged tenants a plan edit would affect, in addition to
 *  tenants explicitly assigned that plan (docs/admin/BRIEF-PHASE-9a-ADDENDUM.md
 *  Part 2, Group A item 2's "show how many organisations are on this plan
 *  before saving" requirement). */
export function getLegacyTierForPlanKey(planKey: PlanKeyType): string | null {
  switch (planKey) {
    case PLAN_KEY.STARTER:
      return ORGANIZATION_TIER.STARTER;
    case PLAN_KEY.PRO:
      return ORGANIZATION_TIER.PROFESSIONAL;
    case PLAN_KEY.ENTERPRISE:
      return ORGANIZATION_TIER.ENTERPRISE;
    default:
      return null;
  }
}

/** Hard-coded, minimal permissive default used ONLY when the resolver
 *  itself errors (Part 2.4: "default to permissive when the resolver
 *  errors, and log it") — never used as a normal code path, and always
 *  paired with a SECURITY-severity audit event so the failure is visible. */
function permissiveDefault(): ResolvedEntitlements {
  return {
    planKey: PLAN_KEY.STARTER,
    modules: ["admin", "finance", "sales", "inventory", "hr", "manufacturing", "crm"],
    limits: {
      maxUsers: 999999,
      maxCompanies: 999999,
      storageGb: 999999,
      apiRequestsPerMonth: 999999,
      aiCreditsPerMonth: 999999,
      aiRequestsPerMonth: 999999,
      automationRunsPerMonth: 999999,
      documentLimitPerMonth: 999999,
      supportLevel: "community",
    },
    featureFlags: {},
    source: "permissive_default",
  };
}

export async function resolveEntitlements(tenantId: string): Promise<ResolvedEntitlements> {
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    await connectDB();
    const entitlement = await OrganizationEntitlement.findOne({ tenantId }).lean();

    let planKey: PlanKeyType;
    let source: ResolvedEntitlements["source"] = "assigned";
    if (entitlement) {
      planKey = entitlement.planKey;
    } else {
      const org = await Organization.findOne({ subdomain: tenantId }, { tier: 1 }).lean();
      planKey = bridgeTierToPlanKey(org?.tier);
      source = "tier_fallback";
    }

    const plan = await Plan.findOne({ key: planKey }).lean();
    if (!plan) throw new Error(`No Plan document found for key "${planKey}"`);

    const overrides = entitlement?.overrides ?? {};
    const { modules: baseModules, featureFlags: baseFlags, ...baseLimits } = plan.features;

    const resolved: ResolvedEntitlements = {
      planKey,
      modules: overrides.modules ?? baseModules,
      limits: { ...baseLimits, ...overrides },
      featureFlags: { ...baseFlags, ...(overrides.featureFlags ?? {}) },
      source,
    };

    cache.set(tenantId, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
    return resolved;
  } catch (err) {
    await emitPlatformAuditEvent({
      actor: { id: "system", role: "system" },
      tenantId,
      eventCategory: PLATFORM_EVENT_CATEGORY.SUBSCRIPTION,
      eventType: PLATFORM_EVENT_TYPE.ENTITLEMENT_OVERRIDDEN,
      severity: PLATFORM_SEVERITY.SECURITY,
      metadata: {
        note: "resolveEntitlements threw — falling back to the permissive default, not a lockout",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return permissiveDefault();
  }
}

export async function resolveEntitlementsBatch(tenantIds: string[]): Promise<Map<string, ResolvedEntitlements>> {
  const result = new Map<string, ResolvedEntitlements>();
  const missing: string[] = [];

  for (const tenantId of tenantIds) {
    const cached = cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      result.set(tenantId, cached.value);
    } else {
      missing.push(tenantId);
    }
  }

  if (missing.length === 0) return result;

  try {
    await connectDB();
    const entitlements = await OrganizationEntitlement.find({ tenantId: { $in: missing } }).lean();
    const entitlementMap = new Map(entitlements.map(e => [e.tenantId, e]));

    const missingOrgs = missing.filter(t => !entitlementMap.has(t));
    let orgMap = new Map();
    if (missingOrgs.length > 0) {
      const orgs = await Organization.find({ subdomain: { $in: missingOrgs } }, { subdomain: 1, tier: 1 }).lean();
      orgMap = new Map(orgs.map(o => [o.subdomain, o]));
    }

    const planKeysToFetch = new Set<PlanKeyType>();
    for (const tenantId of missing) {
      const ent = entitlementMap.get(tenantId);
      if (ent) {
        planKeysToFetch.add(ent.planKey as PlanKeyType);
      } else {
        const org = orgMap.get(tenantId);
        planKeysToFetch.add(bridgeTierToPlanKey(org?.tier));
      }
    }

    const plans = await Plan.find({ key: { $in: Array.from(planKeysToFetch) } }).lean();
    const planMap = new Map(plans.map(p => [p.key, p]));

    for (const tenantId of missing) {
      const ent = entitlementMap.get(tenantId);
      let planKey: PlanKeyType;
      let source: ResolvedEntitlements["source"] = "assigned";
      
      if (ent) {
        planKey = ent.planKey as PlanKeyType;
      } else {
        const org = orgMap.get(tenantId);
        planKey = bridgeTierToPlanKey(org?.tier);
        source = "tier_fallback";
      }

      const plan = planMap.get(planKey);
      if (!plan) {
         await emitPlatformAuditEvent({
           actor: { id: "system", role: "system" },
           tenantId,
           eventCategory: PLATFORM_EVENT_CATEGORY.SUBSCRIPTION,
           eventType: PLATFORM_EVENT_TYPE.ENTITLEMENT_OVERRIDDEN,
           severity: PLATFORM_SEVERITY.SECURITY,
           metadata: {
             note: "resolveEntitlementsBatch threw — falling back to the permissive default",
             error: `No Plan document found for key "${planKey}"`,
           },
         });
         const def = permissiveDefault();
         result.set(tenantId, def);
         cache.set(tenantId, { value: def, expiresAt: Date.now() + CACHE_TTL_MS });
         continue;
      }

      const overrides = ent?.overrides ?? {};
      const { modules: baseModules, featureFlags: baseFlags, ...baseLimits } = plan.features;

      const resolved: ResolvedEntitlements = {
        planKey,
        modules: overrides.modules ?? baseModules,
        limits: { ...baseLimits, ...overrides } as any,
        featureFlags: { ...baseFlags, ...(overrides.featureFlags ?? {}) },
        source,
      };

      cache.set(tenantId, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
      result.set(tenantId, resolved);
    }
  } catch (err) {
    for (const tenantId of missing) {
      await emitPlatformAuditEvent({
        actor: { id: "system", role: "system" },
        tenantId,
        eventCategory: PLATFORM_EVENT_CATEGORY.SUBSCRIPTION,
        eventType: PLATFORM_EVENT_TYPE.ENTITLEMENT_OVERRIDDEN,
        severity: PLATFORM_SEVERITY.SECURITY,
        metadata: {
          note: "resolveEntitlementsBatch threw — falling back to permissive default",
          error: err instanceof Error ? err.message : String(err),
        },
      });
      result.set(tenantId, permissiveDefault());
    }
  }

  return result;
}
