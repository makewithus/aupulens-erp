import type { OrgModuleInfo } from "@/lib/middleware/moduleGate";

/**
 * G4 — entitlement freshness. A JWT signature proves who issued the token, not that the tenant's
 * subscription / modules / the user's account are still valid. Entitlement claims embedded in the
 * JWT are therefore trusted for at most ENTITLEMENT_MAX_AGE_MS. After that (and for legacy tokens
 * with no claims at all) the data must be re-read from the server. If a fresh read is impossible,
 * the caller must DENY rather than fall back to the stale claims or fail open.
 *
 * Edge-safe: no Node/Mongoose imports.
 */
export const ENTITLEMENT_MAX_AGE_MS = 60_000;
/** Tolerate small clock skew between issuer and verifier, but never a far-future timestamp. */
const FUTURE_SKEW_MS = 5_000;

export interface EntitlementClaims {
  orgModuleData?: OrgModuleInfo;
  entitlementVersion?: number;
  entitlementCheckedAt?: number; // epoch ms
}

export type FreshOrgInfo = OrgModuleInfo & { entitlementVersion?: number; userActive?: boolean };

export type EntitlementResolution =
  | { kind: "ok"; org: FreshOrgInfo; source: "jwt" | "server" }
  | { kind: "revoked"; reason: "user_inactive" | "org_inactive" }
  | { kind: "unavailable" };

export function claimsAreFresh(claims: EntitlementClaims, now: number): boolean {
  const at = claims.entitlementCheckedAt;
  if (!claims.orgModuleData || typeof at !== "number" || !Number.isFinite(at)) return false;
  const age = now - at;
  return age >= -FUTURE_SKEW_MS && age <= ENTITLEMENT_MAX_AGE_MS;
}

export async function resolveEntitlements(
  claims: EntitlementClaims,
  fetchFresh: () => Promise<FreshOrgInfo | null>,
  now: number = Date.now(),
): Promise<EntitlementResolution> {
  if (claimsAreFresh(claims, now)) {
    return { kind: "ok", org: claims.orgModuleData as FreshOrgInfo, source: "jwt" };
  }
  let fresh: FreshOrgInfo | null = null;
  try {
    fresh = await fetchFresh();
  } catch {
    fresh = null;
  }
  if (!fresh) return { kind: "unavailable" };
  if (fresh.userActive === false) return { kind: "revoked", reason: "user_inactive" };
  return { kind: "ok", org: fresh, source: "server" };
}
