import connectDB from "@/lib/db";
import AdminRole from "@/models/platform/AdminRole";
import {
  AdminCapability,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";
import { AdminActor } from "./types";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";
import { checkPermissionFailureSpike } from "@/lib/platform/alerts/conditions";

/**
 * The §30 permission matrix, read as data (models/platform/AdminRole.ts),
 * never a scattered `if (role === ...)` conditional — matches the shape of
 * lib/org/rbac.ts / lib/crm/rbac.ts (small, explicit, exported capability
 * checks) but backed by a DB-configurable matrix rather than a hardcoded
 * array, since Hard Rule 6 requires entitlements/permissions to be
 * configuration, not code.
 */

interface CacheEntry {
  capabilities: Set<AdminCapability>;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // matches middleware.ts's existing getOrgModuleData cache window
const roleCache = new Map<string, CacheEntry>();

export function invalidateAdminRoleCache(role?: string): void {
  if (role) roleCache.delete(role);
  else roleCache.clear();
}

async function getCapabilitiesForRole(role: string): Promise<Set<AdminCapability>> {
  const cached = roleCache.get(role);
  if (cached && cached.expiresAt > Date.now()) return cached.capabilities;

  await connectDB();
  const doc = await AdminRole.findOne({ role }).lean();
  const capabilities = new Set<AdminCapability>((doc?.capabilities as AdminCapability[]) ?? []);
  roleCache.set(role, { capabilities, expiresAt: Date.now() + CACHE_TTL_MS });
  return capabilities;
}

export async function hasCapability(
  actor: Pick<AdminActor, "role">,
  capability: AdminCapability,
): Promise<boolean> {
  const capabilities = await getCapabilitiesForRole(actor.role);
  return capabilities.has(capability);
}

export class AdminForbiddenError extends Error {
  constructor(capability: AdminCapability) {
    super(`Admin actor lacks required capability: ${capability}`);
    this.name = "AdminForbiddenError";
  }
}

export async function requireCapability(
  actor: Pick<AdminActor, "role"> & Partial<Pick<AdminActor, "id" | "ip" | "userAgent">>,
  capability: AdminCapability,
): Promise<void> {
  if (!(await hasCapability(actor, capability))) {
    // Phase 9 Addendum C Part 3: every capability denial across the admin
    // surface is now real, captured data — not only the cross-tenant
    // gateway's own CROSS_TENANT_READ_DENIED — the source for the
    // "repeated permission failures" §28 alert. `actor.id` is optional on
    // this function's signature (some call sites only have a role at hand);
    // recorded as "unknown" rather than skipping the audit entirely when
    // absent, since a denial with no attributable actor is still a real
    // security-relevant event.
    await emitPlatformAuditEvent({
      actor: { id: actor.id ?? "unknown", role: actor.role },
      eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
      eventType: PLATFORM_EVENT_TYPE.CAPABILITY_DENIED,
      severity: PLATFORM_SEVERITY.SECURITY,
      metadata: { capability },
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });
    if (actor.id) {
      await checkPermissionFailureSpike(actor.id);
    }
    throw new AdminForbiddenError(capability);
  }
}
