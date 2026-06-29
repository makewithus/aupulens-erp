/**
 * Tier → limits map — the SINGLE SOURCE OF TRUTH for per-tier caps.
 *
 * - Do NOT read limits from org.maxUsers / org.aiCallsPerMonth in routes;
 *   always call getTierLimits(org.tier) so limits stay in sync with the tier.
 * - org.maxUsers / org.aiCallsPerMonth on the Organization doc are kept as
 *   schema fields for potential per-org enterprise overrides (e.g. custom deals),
 *   but they are NOT used for enforcement — this file is authoritative.
 * - enabledModules matches the route-prefix strings guarded in middleware.ts
 *   (admin, finance, hr, sales, inventory, manufacturing, crm).
 *   Step 5 will wire these into middleware for hard-gating.
 */

import {
  ORGANIZATION_TIER,
  type OrganizationTier,
} from "@/lib/constants/statuses";

export interface TierLimits {
  maxUsers: number;
  aiCallsPerMonth: number;
  enabledModules: readonly string[];
}

export const TIER_LIMITS: Readonly<Record<OrganizationTier, TierLimits>> = {
  [ORGANIZATION_TIER.STARTER]: {
    maxUsers: 5,
    aiCallsPerMonth: 100,
    enabledModules: ["admin", "hr", "inventory"],
  },
  [ORGANIZATION_TIER.PROFESSIONAL]: {
    maxUsers: 25,
    aiCallsPerMonth: 1000,
    enabledModules: ["admin", "hr", "inventory", "finance", "sales", "crm"],
  },
  [ORGANIZATION_TIER.ENTERPRISE]: {
    maxUsers: 100,
    aiCallsPerMonth: 10000,
    enabledModules: [
      "admin",
      "hr",
      "inventory",
      "finance",
      "sales",
      "crm",
      "manufacturing",
    ],
  },
} as const;

/**
 * Returns limits for the given tier.
 * Falls back to starter limits for any unrecognised/undefined tier so code
 * never hard-crashes on a bad tier value stored in an old document.
 */
export function getTierLimits(
  tier: OrganizationTier | string | undefined | null
): TierLimits {
  if (tier && (tier as string) in TIER_LIMITS) {
    return TIER_LIMITS[tier as OrganizationTier];
  }
  return TIER_LIMITS[ORGANIZATION_TIER.STARTER];
}
