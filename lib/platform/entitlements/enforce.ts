import { NextResponse } from "next/server";
import { resolveEntitlements } from "./resolve";

/**
 * The one enforcement primitive every tenant-facing route calls (Phase 3b).
 * Deliberately a single function, not a middleware layer or a new
 * abstraction over existing routes — inserted as one additional line in the
 * exact same auth() → tenantId → connectDB() sequence every route already
 * follows (docs/_context/CONVENTIONS.md), so a route that adopts this looks
 * like every other route in the codebase plus one line, not a rewrite.
 *
 * Fails open, not closed, when the resolver itself is in its own permissive-
 * default failure mode (Phase 3a's own contract) — an entitlement-resolution
 * error must never compound into "and now the customer's own accounting
 * route is blocked too." A wrong ALLOW is recoverable; a wrong BLOCK is a
 * paying customer locked out (the brief's own stated risk for this phase).
 */
export async function moduleIsEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
  const entitlements = await resolveEntitlements(tenantId);
  if (entitlements.source === "permissive_default") return true;
  return entitlements.modules.includes(moduleKey);
}

/**
 * Returns a ready-to-return NextResponse when the module is not entitled,
 * or `null` when the caller should proceed. Response shape matches this
 * repo's `{success:false, message}` convention (docs/_context/CONVENTIONS.md)
 * — note this specific route (app/api/inventory/orders) predates that
 * convention and uses `{error}` instead; new call sites should prefer
 * `{success:false, message}` and this helper supports either via the
 * `legacyErrorShape` option so wiring it in never changes a route's existing
 * response contract.
 */
export async function requireModuleEnabled(
  tenantId: string,
  moduleKey: string,
  options: { legacyErrorShape?: boolean } = {},
): Promise<NextResponse | null> {
  const enabled = await moduleIsEnabled(tenantId, moduleKey);
  if (enabled) return null;

  const message = `Your current plan does not include the "${moduleKey}" module. Contact your workspace admin to upgrade.`;
  return NextResponse.json(
    options.legacyErrorShape ? { error: message } : { success: false, message },
    { status: 403 },
  );
}
