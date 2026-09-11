import connectDB from "@/lib/db";
import AdminRole from "@/models/platform/AdminRole";
import { AdminCapability } from "@/lib/constants/statuses";
import { AdminActor } from "./types";

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
  actor: Pick<AdminActor, "role">,
  capability: AdminCapability,
): Promise<void> {
  if (!(await hasCapability(actor, capability))) {
    throw new AdminForbiddenError(capability);
  }
}
